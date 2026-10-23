import { ACTION, BOARD_WIDTH, type GameState, type LockEvent, SPAWN_Y } from '../engine';
import { nextRandom } from '../engine/random';
import { isPerfectClear } from '../battle-engine/battle';

/**
 * 화면 연출 기록 — 엔진 프레임 전후 상태를 비교해 연출 이벤트(줄 삭제 파티클·하드 드롭 잔상·흔들림·문구)를 만든다
 * 엔진 상태는 읽기만 한다. 모든 연출은 시작 프레임과 나이(엔진 프레임 수)로 그려서
 * 일시정지·배속 재생에서도 엔진과 같은 시간으로 움직이고, 탐색으로 프레임이 되돌아가면 비운다
 * 화면용 난수는 엔진 상태와 분리된 별도 시드를 쓴다 — 같은 판이면 같은 연출(스크린샷·테스트 재현)
 * 리플레이를 뒤로 탐색하면 가장 가까운 스냅샷부터 다시 관찰하므로, 스냅샷 이전에 시작된 연출은 빠질 수 있다(화면용이라 허용)
 * 소리 신호(cues)도 여기서 만든다 — 소리를 내는 쪽(lib/sound)이 틱마다 꺼내 쓴다(drainCues). 엔진 결과에는 영향 없음
 */

/** 동시에 살아 있는 파티클 상한 — 넘으면 오래된 것부터 버린다 */
export const MAX_PARTICLES = 180;
export const PARTICLE_LIFE_FRAMES = 42;
export const TRAIL_LIFE_FRAMES = 10;
export const TEXT_LIFE_FRAMES = 60;
export const LEVEL_FADE_FRAMES = 40;
/** 줄 삭제 충격파 링 수명 */
export const RING_LIFE_FRAMES = 24;
/** 가비지가 들어온 뒤 판이 아래에서 밀려 올라오는 연출 */
export const RISE_FRAMES = 10;
/** 꺼내지 않은 소리 신호 상한 — 소리가 꺼져 있어 아무도 꺼내지 않아도 쌓이지 않게 */
export const MAX_CUES = 32;
/** 연출 난수 시작값 — 새 판·되감기마다 여기서 다시 시작한다 */
const EFFECT_RNG_SEED = 0x2f6b1d3;

/** 콤보 단계 — 이 콤보 수부터 문구·색·흔들림이 한 단계씩 커진다 (DESIGN §4) */
export const COMBO_TIERS: readonly number[] = [3, 5, 8, 11];

export function comboTier(combo: number): number {
  let tier = 0;
  for (const threshold of COMBO_TIERS) if (combo >= threshold) tier++;
  return tier;
}

/** 위치·속도 단위는 판 칸(cell). 위치는 판 좌표(y는 숨은 줄 포함 행 번호) */
export type Particle = {
  frame: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 칸 값 (1~7 블록, 8 가비지) */
  cell: number;
};

export type Trail = { frame: number; piece: number; rotation: number; x: number; fromY: number; toY: number };

export type Shake = { frame: number; magnitude: number; duration: number };

export type EffectText = { text: string; tier: number };

export type TextBurst = { frame: number; lines: EffectText[] };

export type LevelChange = { frame: number; from: number; to: number };

/** 줄 삭제 충격파 — 지운 줄 가운데에서 퍼진다 */
export type ClearRing = { frame: number; row: number; big: boolean };

/** 콤보 미터 — 마지막으로 줄을 지운 고정의 콤보(0 = 첫 삭제). 줄을 못 지운 고정에서 끝난다 */
export type ComboMeter = { frame: number; combo: number; ended: boolean };

/** 가비지 상승 — 대전 래퍼가 판에 넣은 줄 수 (noteGarbageRise) */
export type GarbageRise = { frame: number; lines: number };

/**
 * 소리 신호 — 화면 연출과 같은 관찰에서 나온다. value: clear=지운 줄 수, combo=콤보 수, level=새 레벨
 * 대전 신호(attack·garbage·ko·win·countdown·go)는 대전 화면이 직접 낸다
 */
export type SoundCueKind =
  | 'move'
  | 'rotate'
  | 'hold'
  | 'hardDrop'
  | 'lock'
  | 'clear'
  | 'tspin'
  | 'combo'
  | 'b2b'
  | 'perfectClear'
  | 'levelUp'
  | 'gameOver'
  | 'attack'
  | 'garbage'
  | 'ko'
  | 'win'
  | 'countdown'
  | 'go';
export type SoundCue = { kind: SoundCueKind; value?: number };

export type EffectTracker = {
  particles: Particle[];
  trail: Trail | null;
  shake: Shake | null;
  text: TextBurst | null;
  level: LevelChange | null;
  ring: ClearRing | null;
  combo: ComboMeter | null;
  rise: GarbageRise | null;
  /** 아직 소리로 내지 않은 신호 (drainCues) */
  cues: SoundCue[];
  /** 마지막으로 관찰한 프레임 — 이보다 앞 프레임의 상태가 오면 새 판·되감기로 보고 비운다 */
  frame: number;
  rng: number;
  before: {
    active: boolean;
    holdUsed: boolean;
    x: number;
    y: number;
    rotation: number;
    over: boolean;
    pieces: number;
    level: number;
    pendingHardDrop: boolean;
  };
};

const EMPTY_BEFORE: EffectTracker['before'] = {
  active: false,
  holdUsed: false,
  x: 0,
  y: 0,
  rotation: 0,
  over: false,
  pieces: 0,
  level: 1,
  pendingHardDrop: false,
};

export function createEffectTracker(): EffectTracker {
  return {
    particles: [],
    trail: null,
    shake: null,
    text: null,
    level: null,
    ring: null,
    combo: null,
    rise: null,
    cues: [],
    frame: -1,
    rng: EFFECT_RNG_SEED,
    before: { ...EMPTY_BEFORE },
  };
}

export function resetEffects(fx: EffectTracker): void {
  fx.particles.length = 0;
  fx.trail = null;
  fx.shake = null;
  fx.text = null;
  fx.level = null;
  fx.ring = null;
  fx.combo = null;
  fx.rise = null;
  fx.cues.length = 0;
  fx.frame = -1;
  fx.rng = EFFECT_RNG_SEED;
  fx.before = { ...EMPTY_BEFORE };
}

/** stepFrame 직전에 부른다 */
export function observeBefore(fx: EffectTracker, state: GameState): void {
  if (state.frame < fx.frame) resetEffects(fx);
  const before = fx.before;
  before.active = state.active;
  before.holdUsed = state.holdUsed;
  before.x = state.x;
  before.y = state.y;
  before.rotation = state.rotation;
  before.over = state.over;
  before.pieces = state.pieces;
  before.level = state.level;
  before.pendingHardDrop = state.pending.indexOf(ACTION.HARD_DROP) !== -1;
}

function random(fx: EffectTracker): number {
  const [next, value] = nextRandom(fx.rng);
  fx.rng = next;
  return value / 4294967296;
}

function pushCue(fx: EffectTracker, cue: SoundCue): void {
  fx.cues.push(cue);
  if (fx.cues.length > MAX_CUES) fx.cues.splice(0, fx.cues.length - MAX_CUES);
}

/** 쌓인 소리 신호를 꺼낸다 — 소리를 내는 쪽이 틱마다 부른다 */
export function drainCues(fx: EffectTracker): SoundCue[] {
  if (fx.cues.length === 0) return [];
  return fx.cues.splice(0, fx.cues.length);
}

/** 대전 래퍼가 가비지를 판에 넣은 직후 부른다 — 판이 아래에서 밀려 올라오는 연출 + 경고음 */
export function noteGarbageRise(fx: EffectTracker, frame: number, lines: number): void {
  if (lines <= 0) return;
  fx.rise = { frame, lines };
  pushCue(fx, { kind: 'garbage', value: lines });
}

function clearLabel(lock: LockEvent): string | null {
  const count = ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][lock.lines] ?? '';
  if (lock.tSpin === 'full') return count ? `T-SPIN ${count}` : 'T-SPIN';
  if (lock.tSpin === 'mini') return count ? `T-SPIN MINI ${count}` : 'T-SPIN MINI';
  if (lock.lines === 4) return 'TETRIS';
  return null;
}

/** 크게 연출할 삭제 — 테트리스·줄을 지운 T-스핀 */
export function isBigClear(lock: LockEvent): boolean {
  return lock.lines === 4 || (lock.tSpin !== 'none' && lock.lines > 0);
}

function spawnClearParticles(fx: EffectTracker, state: GameState, lock: LockEvent): void {
  const big = isBigClear(lock);
  const perCell = big ? 3 : 1;
  const speed = big ? 0.55 : 0.35;
  for (const row of lock.rows) {
    for (let col = 0; col < BOARD_WIDTH; col++) {
      const cell = state.board[row * BOARD_WIDTH + col];
      if (cell === 0) continue;
      for (let i = 0; i < perCell; i++) {
        const angle = random(fx) * Math.PI * 2;
        const power = speed * (0.4 + random(fx) * 0.8);
        fx.particles.push({
          frame: lock.frame,
          x: col + 0.5,
          y: row + 0.5,
          vx: Math.cos(angle) * power,
          vy: Math.sin(angle) * power - (big ? 0.25 : 0.15),
          size: 0.18 + random(fx) * (big ? 0.3 : 0.2),
          cell,
        });
      }
    }
  }
  const overflow = fx.particles.length - MAX_PARTICLES;
  if (overflow > 0) fx.particles.splice(0, overflow);
}

/** stepFrame 직후에 부른다 — actions·applied는 stepFrame에 넘긴 입력과 그 반환값 */
export function observeAfter(fx: EffectTracker, state: GameState, actions: ArrayLike<number>, applied: number): void {
  const before = fx.before;
  fx.frame = state.frame;
  const frame = state.frame - 1;

  if (state.level > before.level) {
    fx.level = { frame, from: before.level, to: state.level };
    pushCue(fx, { kind: 'levelUp', value: state.level });
  }
  if (state.over && !before.over) pushCue(fx, { kind: 'gameOver' });

  const lock = state.lastLock;
  if (state.pieces === before.pieces || !lock) {
    // 같은 블록을 조작 중 — 옆 이동·회전(자동 반복 이동 포함)·홀드
    if (before.active && state.active) {
      if (state.holdUsed && !before.holdUsed) pushCue(fx, { kind: 'hold' });
      else if (state.rotation !== before.rotation) pushCue(fx, { kind: 'rotate' });
      else if (state.x !== before.x) pushCue(fx, { kind: 'move' });
    } else if (!before.active && state.active) {
      // 생성 프레임 — 지연 중 미리 누른 홀드·회전(IHS·IRS)이 적용됐다 (생성 회전은 0)
      if (state.holdUsed && !before.holdUsed) pushCue(fx, { kind: 'hold' });
      else if (state.rotation !== 0) pushCue(fx, { kind: 'rotate' });
    }
    return;
  }

  let hardDrop = before.pendingHardDrop && !before.active;
  let held = false;
  for (let i = 0; i < applied && !hardDrop; i++) {
    // 이미 홀드를 쓴 블록이면 엔진이 HOLD를 무시한다
    if (actions[i] === ACTION.HOLD && !before.holdUsed) held = true;
    if (actions[i] === ACTION.HARD_DROP) hardDrop = true;
  }

  // 도착 = 고정된 자리(lockPiece는 x·y·회전을 바꾸지 않는다). 출발 = 프레임 시작 때 조작 중이던 블록 높이,
  // 이 프레임에 새로 나왔거나 홀드로 바뀐 블록이면 생성 높이(엔진은 아래가 비면 한 줄 아래에 놓지만 화면용이라 SPAWN_Y로 근사)
  if (hardDrop) {
    const fromY = before.active && !held ? before.y : SPAWN_Y;
    if (state.y > fromY) {
      fx.trail = { frame, piece: lock.piece, rotation: state.rotation, x: state.x, fromY, toY: state.y };
    }
  }

  if (lock.lines > 0) {
    spawnClearParticles(fx, state, lock);
    const rows = lock.rows;
    fx.ring = { frame, row: (rows[0] + rows[rows.length - 1] + 1) / 2, big: isBigClear(lock) };
  }
  const perfect = lock.lines > 0 && isPerfectClear(state.board, lock.rows);
  if (lock.lines > 0) fx.combo = { frame, combo: lock.combo, ended: false };
  else if (fx.combo && !fx.combo.ended) fx.combo = { ...fx.combo, frame, ended: true };

  // 소리 — 한 고정에 가장 큰 사건 하나 + 덧붙는 B2B·콤보·퍼펙트
  pushCue(fx, { kind: hardDrop ? 'hardDrop' : 'lock' });
  if (lock.lines > 0) {
    pushCue(fx, lock.tSpin !== 'none' ? { kind: 'tspin', value: lock.lines } : { kind: 'clear', value: lock.lines });
    if (lock.backToBack) pushCue(fx, { kind: 'b2b' });
    if (lock.combo >= 1) pushCue(fx, { kind: 'combo', value: lock.combo });
    if (perfect) pushCue(fx, { kind: 'perfectClear' });
  }

  const lines: EffectText[] = [];
  const label = clearLabel(lock);
  const tier = lock.lines > 0 ? comboTier(lock.combo) : 0;
  if (label) lines.push({ text: label, tier: Math.max(tier, 1) });
  if (perfect) lines.push({ text: 'PERFECT CLEAR', tier: 4 });
  if (lock.backToBack) lines.push({ text: 'BACK-TO-BACK', tier: Math.max(tier, 1) });
  if (lock.lines > 0 && lock.combo >= 1) lines.push({ text: `COMBO ×${lock.combo}`, tier });
  if (fx.level && fx.level.frame === frame) lines.push({ text: `LEVEL ${state.level}`, tier: 0 });
  if (lines.length > 0) fx.text = { frame, lines };

  let magnitude = hardDrop ? 1.5 : 0;
  if (lock.lines > 0) magnitude = Math.max(magnitude, isBigClear(lock) ? 4 : 0) + tier;
  if (magnitude > 0) fx.shake = { frame, magnitude, duration: 8 + Math.round(magnitude * 2) };
}
