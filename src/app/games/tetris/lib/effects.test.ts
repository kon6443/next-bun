import { describe, expect, it } from 'vitest';
import { ACTION, BOARD_WIDTH, type GameState, PIECE, SPAWN_Y, createGame, getBoardHash, getDropY, stepFrame } from '../engine';
import {
  MAX_CUES,
  MAX_PARTICLES,
  comboTier,
  createEffectTracker,
  drainCues,
  noteGarbageRise,
  observeAfter,
  observeBefore,
  resetEffects,
} from './effects';
import { resolveReducedEffects } from './effectsSettings';

/** 엔진 테스트와 같은 방식 — 연출 기록을 끼워 한 프레임 진행 */
function step(fx: ReturnType<typeof createEffectTracker>, state: GameState, ...actions: number[]) {
  observeBefore(fx, state);
  const applied = stepFrame(state, actions, actions.length);
  observeAfter(fx, state, actions, applied);
}

function fillRow(state: GameState, y: number, holes: number[] = []): void {
  for (let x = 0; x < BOARD_WIDTH; x++) state.board[y * BOARD_WIDTH + x] = holes.includes(x) ? 0 : 7;
}

/** 세로 I를 9열 우물 위에 둔다 */
function setVerticalI(state: GameState): void {
  state.piece = PIECE.I;
  state.rotation = 1;
  state.x = 7;
  state.y = 20;
  state.lowestY = 20;
  state.lockTimer = 0;
  state.active = true;
}

const newGame = () => createGame({ seed: 12345, das: 10, arr: 2 });

describe('연출 기록', () => {
  it('하드 드롭은 출발~도착 잔상과 작은 흔들림을 남긴다', () => {
    const g = newGame();
    const fx = createEffectTracker();
    const fromY = g.y;
    const toY = getDropY(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.trail).toMatchObject({ piece: g.lastLock?.piece, fromY, toY, frame: 0 });
    expect(fx.shake?.magnitude).toBe(1.5);
    expect(fx.particles).toHaveLength(0);
    expect(fx.text).toBeNull();
  });

  it('자연 고정은 잔상·흔들림이 없다', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 3000 && g.pieces === 0; i++) step(fx, g);
    expect(g.pieces).toBe(1);
    expect(fx.trail).toBeNull();
    expect(fx.shake).toBeNull();
  });

  it('테트리스는 지운 칸마다 조각 3개, TETRIS 문구, 큰 흔들림', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 4; i++) fillRow(g, 39 - i, [9]);
    g.board[34 * BOARD_WIDTH] = 7; // 남는 칸 — 퍼펙트 클리어가 아니게
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(g.lastLock?.lines).toBe(4);
    expect(fx.particles).toHaveLength(4 * BOARD_WIDTH * 3);
    expect(fx.text?.lines.map((l) => l.text)).toEqual(['TETRIS']);
    expect(fx.shake?.magnitude).toBe(4);
  });

  it('연속 테트리스는 BACK-TO-BACK·COMBO ×1 문구', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 8; i++) fillRow(g, 39 - i, [9]);
    g.board[30 * BOARD_WIDTH] = 7; // 남는 칸 — 퍼펙트 클리어가 아니게
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    while (!g.active) step(fx, g);
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.text?.lines.map((l) => l.text)).toEqual(['TETRIS', 'BACK-TO-BACK', 'COMBO ×1']);
    expect(fx.particles.length).toBeLessThanOrEqual(MAX_PARTICLES);
  });

  it('프레임이 되돌아가면(새 판·되감기) 기록을 비운다', () => {
    const g = newGame();
    const fx = createEffectTracker();
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.trail).not.toBeNull();
    observeBefore(fx, newGame());
    expect(fx.trail).toBeNull();
    expect(fx.shake).toBeNull();
  });

  it('지연 중 미리 눌러 생성 프레임에 적용된 하드 드롭도 생성 높이부터 잔상이 남는다', () => {
    const g = newGame();
    const fx = createEffectTracker();
    step(fx, g, ACTION.HARD_DROP);
    step(fx, g, ACTION.HARD_DROP); // 생성 지연 중 → pending
    fx.trail = null;
    while (g.pieces < 2) step(fx, g);
    expect(fx.trail).toMatchObject({ fromY: SPAWN_Y, toY: g.y, x: g.x, rotation: g.rotation, piece: g.lastLock?.piece });
  });

  it('같은 프레임에 홀드 후 하드 드롭하면 새로 나온 블록 기준 — 고정된 자리까지', () => {
    const g = newGame();
    const fx = createEffectTracker();
    step(fx, g, ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE, ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
    step(fx, g, ACTION.HOLD, ACTION.HARD_DROP);
    expect(g.pieces).toBe(1);
    expect(fx.trail).toMatchObject({ fromY: SPAWN_Y, toY: g.y, x: g.x });
  });

  it('레벨이 오르면 LEVEL 문구와 배경 전환 기록', () => {
    const g = newGame();
    const fx = createEffectTracker();
    g.lines = 9;
    fillRow(g, 39, [9]);
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(g.level).toBe(2);
    expect(fx.level).toEqual({ frame: 0, from: 1, to: 2 });
    expect(fx.text?.lines.map((l) => l.text)).toContain('LEVEL 2');
  });

  it('연출 관찰은 엔진 결과를 바꾸지 않는다 (같은 입력, 관찰 유무 비교)', () => {
    const plain = newGame();
    const observed = newGame();
    const fx = createEffectTracker();
    const pattern = [[ACTION.LEFT_PRESS], [], [ACTION.LEFT_RELEASE, ACTION.ROTATE_CW], [ACTION.HARD_DROP], [ACTION.HOLD], [ACTION.HARD_DROP]];
    for (let f = 0; f < 3000 && !plain.over; f++) {
      const actions = pattern[f % pattern.length];
      stepFrame(plain, actions, actions.length);
      step(fx, observed, ...actions);
    }
    expect(getBoardHash(observed)).toBe(getBoardHash(plain));
    expect([observed.frame, observed.score, observed.rng, observed.over]).toEqual([plain.frame, plain.score, plain.rng, plain.over]);
  });

  it('같은 판이면 같은 파티클 (화면 재현)', () => {
    const run = () => {
      const g = newGame();
      const fx = createEffectTracker();
      fillRow(g, 39, [9]);
      setVerticalI(g);
      step(fx, g, ACTION.HARD_DROP);
      return fx.particles;
    };
    expect(run()).toEqual(run());
  });

  it('리셋 뒤 같은 판을 다시 하면 같은 파티클 (재시작·되감기)', () => {
    const fx = createEffectTracker();
    const run = () => {
      const g = newGame();
      fillRow(g, 39, [9]);
      setVerticalI(g);
      step(fx, g, ACTION.HARD_DROP);
      return fx.particles.map((p) => ({ ...p }));
    };
    const first = run();
    resetEffects(fx);
    expect(run()).toEqual(first);
  });
});

describe('콤보 단계', () => {
  it('3·5·8·11콤보에서 한 단계씩 오른다', () => {
    expect([0, 2, 3, 4, 5, 7, 8, 10, 11, 20].map(comboTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('연출 줄이기 설정', () => {
  it('저장값이 없으면 기기 설정을 따르고, 저장값이 있으면 그 값', () => {
    expect(resolveReducedEffects('auto', true)).toBe(true);
    expect(resolveReducedEffects('auto', false)).toBe(false);
    expect(resolveReducedEffects('on', false)).toBe(true);
    expect(resolveReducedEffects('off', true)).toBe(false);
  });
});

describe('연출 2차 — 충격파·콤보 미터·퍼펙트 클리어·가비지 상승', () => {
  it('줄 삭제는 지운 줄 가운데에서 충격파, 테트리스는 큰 충격파', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 4; i++) fillRow(g, 39 - i, [9]);
    g.board[34 * BOARD_WIDTH] = 7;
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.ring).toEqual({ frame: 0, row: 38, big: true });
  });

  it('판이 비면 PERFECT CLEAR 문구', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 4; i++) fillRow(g, 39 - i, [9]);
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.text?.lines.map((l) => l.text)).toEqual(['TETRIS', 'PERFECT CLEAR']);
  });

  it('콤보 미터 — 줄을 지우면 이어지고, 줄을 못 지운 고정에서 끝난다', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 8; i++) fillRow(g, 39 - i, [9]);
    g.board[30 * BOARD_WIDTH] = 7;
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.combo).toMatchObject({ combo: 0, ended: false });
    while (!g.active) step(fx, g);
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(fx.combo).toMatchObject({ combo: 1, ended: false });
    while (!g.active) step(fx, g);
    step(fx, g, ACTION.HARD_DROP); // 빈 판 위 고정 — 줄 없음
    expect(fx.combo).toMatchObject({ combo: 1, ended: true });
  });

  it('가비지 상승은 연출과 경고음 신호를 남긴다 (0줄은 무시)', () => {
    const fx = createEffectTracker();
    noteGarbageRise(fx, 5, 0);
    expect(fx.rise).toBeNull();
    noteGarbageRise(fx, 5, 3);
    expect(fx.rise).toEqual({ frame: 5, lines: 3 });
    expect(drainCues(fx)).toEqual([{ kind: 'garbage', value: 3 }]);
  });
});

describe('소리 신호 (연출과 같은 관찰)', () => {
  it('이동·회전·홀드·하드 드롭 신호', () => {
    const g = newGame();
    const fx = createEffectTracker();
    step(fx, g); // 생성
    drainCues(fx);
    step(fx, g, ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
    step(fx, g, ACTION.ROTATE_CW);
    step(fx, g, ACTION.HOLD);
    expect(drainCues(fx).map((c) => c.kind)).toEqual(['move', 'rotate', 'hold']);
    while (!g.active) step(fx, g);
    drainCues(fx);
    step(fx, g, ACTION.HARD_DROP);
    expect(drainCues(fx)).toEqual([{ kind: 'hardDrop' }]);
  });

  it('생성 지연 중 미리 누른 홀드(IHS)도 생성 프레임에 홀드 신호', () => {
    const g = newGame();
    const fx = createEffectTracker();
    step(fx, g, ACTION.HARD_DROP);
    while (!g.active) {
      drainCues(fx);
      step(fx, g, ACTION.HOLD);
    }
    expect(g.holdUsed).toBe(true);
    expect(drainCues(fx).map((c) => c.kind)).toContain('hold');
  });

  it('테트리스 + B2B + 콤보 신호 — 줄 수·콤보 값을 담는다', () => {
    const g = newGame();
    const fx = createEffectTracker();
    for (let i = 0; i < 8; i++) fillRow(g, 39 - i, [9]);
    g.board[30 * BOARD_WIDTH] = 7;
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(drainCues(fx)).toEqual([{ kind: 'hardDrop' }, { kind: 'clear', value: 4 }]);
    while (!g.active) step(fx, g);
    drainCues(fx);
    setVerticalI(g);
    step(fx, g, ACTION.HARD_DROP);
    expect(drainCues(fx)).toEqual([{ kind: 'hardDrop' }, { kind: 'clear', value: 4 }, { kind: 'b2b' }, { kind: 'combo', value: 1 }]);
  });

  it('꺼내지 않은 신호는 상한까지만 쌓인다 — 소리가 꺼져 있어도 메모리가 늘지 않게', () => {
    const fx = createEffectTracker();
    for (let i = 0; i < MAX_CUES + 20; i++) noteGarbageRise(fx, i, 1);
    expect(fx.cues).toHaveLength(MAX_CUES);
  });

  it('연출·소리 기록은 엔진 결과를 바꾸지 않는다 (같은 입력 → 같은 판)', () => {
    const run = (withFx: boolean) => {
      const g = newGame();
      const fx = createEffectTracker();
      for (let f = 0; f < 1500; f++) {
        const actions = f % 23 === 0 ? [ACTION.HARD_DROP] : f % 7 === 0 ? [ACTION.ROTATE_CW] : f % 5 === 0 ? [ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE] : [];
        if (withFx) {
          observeBefore(fx, g);
          const applied = stepFrame(g, actions, actions.length);
          observeAfter(fx, g, actions, applied);
          drainCues(fx);
        } else {
          stepFrame(g, actions, actions.length);
        }
      }
      return getBoardHash(g);
    };
    expect(run(true)).toBe(run(false));
  });
});
