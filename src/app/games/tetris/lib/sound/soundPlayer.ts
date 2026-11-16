/**
 * Web Audio 소리 플레이어 — 레시피(recipes.ts)를 공용 소리 엔진(_shared/lib/soundEngine)으로 울린다
 * - 효과음·배경음악이 모두 꺼져 있으면 AudioContext를 만들지 않는다(기본 꺼짐)
 * - AudioContext는 사용자 첫 조작(pointerdown·keydown·touchstart) 뒤에만 만들거나 resume한다(iOS 자동재생 정책)
 * - 게임 공통 소리 설정(_shared/lib/soundSettings)을 구독해 효과음·배경음 켜기/끄기와 음량을 바로 반영한다(재생 중인 소리 포함)
 * - 공통 소리 모달이 켜는 클릭 안에서 깨울 수 있게 unlock을 등록한다(_shared/lib/soundUnlock)
 */
import { createSoundEngine } from '@/app/games/_shared/lib/soundEngine';
import type { SoundCue, SoundCueKind } from '../effects';
import { MUSIC_PATTERN_STEPS, MUSIC_STEP_SECONDS, musicStep, recipeFor } from './recipes';

/** 동시에 울리는 효과음 voice 상한 — 넘치면 새 voice를 버린다 */
export const MAX_SFX_VOICES = 24;
const SFX_BUS_LEVEL = 0.8;
const MUSIC_BUS_LEVEL = 0.35;
/**
 * 오디오 시작을 시도할 조작 — iOS·Android는 터치의 pointerdown·touchstart를 사용자 활성화로 치지 않는다(touchend·pointerup·click은 친다)
 * 그래서 컨텍스트가 실제로 running이 될 때까지 리스너를 떼지 않는다
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown'] as const;

/** 한 틱에 voice 상한을 넘으면 덜 중요한 것부터 버린다 — 큰 사건(퍼펙트·줄 삭제·B2B)이 이동·고정음에 밀리지 않게 */
const CUE_PRIORITY: Partial<Record<SoundCueKind, number>> = {
  perfectClear: 0,
  win: 0,
  gameOver: 0,
  ko: 1,
  clear: 1,
  tspin: 1,
  b2b: 2,
  levelUp: 2,
  combo: 3,
  attack: 3,
  garbage: 3,
  go: 3,
  countdown: 3,
};
const priorityOf = (cue: SoundCue) => CUE_PRIORITY[cue.kind] ?? 9;

/** 중요한 신호가 앞에 오도록 정렬한 새 배열 (같은 중요도는 들어온 순서 유지) */
export function orderCuesByPriority(cues: readonly SoundCue[]): readonly SoundCue[] {
  return cues.length > 1 ? [...cues].sort((a, b) => priorityOf(a) - priorityOf(b)) : cues;
}

/** 큰 사건 — 퍼펙트·승패·KO·T-스핀·4줄·B2B·레벨업. 이동·고정음·한두 줄 삭제·콤보는 뺀다 */
export function isBigCue(cue: SoundCue): boolean {
  if (cue.kind === 'clear') return (cue.value ?? 0) >= 4;
  return priorityOf(cue) <= 2;
}

/** 다시보기 배속이 이 이상이면 큰 사건만 울린다 — 4배속의 이동·고정음은 소음이 된다 */
export const REPLAY_BIG_CUES_ONLY_SPEED = 4;

/** 다시보기에서 울릴 신호 — 배속이 빠르면 큰 사건만 (games-polish P7) */
export function replayCues(cues: readonly SoundCue[], speed: number): readonly SoundCue[] {
  return speed >= REPLAY_BIG_CUES_ONLY_SPEED ? cues.filter(isBigCue) : cues;
}

export type SoundPlayer = {
  /** 한 틱에 쌓인 신호를 울린다 — 효과음이 꺼져 있거나 아직 조작 전이면 아무것도 하지 않는다 */
  playCues(cues: readonly SoundCue[]): void;
  play(cue: SoundCue): void;
  /** 게임 화면이 음악을 켜고 끈다 — 설정의 music이 꺼져 있으면 켜도 울리지 않는다 */
  setMusicPlaying(on: boolean): void;
  /** 사용자 조작 핸들러 안에서 부른다 — AudioContext를 만들거나 resume한다(설정이 모두 꺼져 있으면 무시) */
  unlock(): void;
  /** 음악 스케줄러가 돌고 있는지 */
  isMusicRunning(): boolean;
  /** 리스너·타이머·구독을 풀고 AudioContext를 닫는다 */
  dispose(): void;
};

export type SoundPlayerOptions = {
  /** 테스트에서 가짜 AudioContext를 주입한다 — null을 돌려주면 소리 없이 동작 */
  createContext?: () => AudioContext | null;
  /** throttle 기준 시계(ms) */
  now?: () => number;
  /** 첫 조작을 기다릴 대상 — 기본 window */
  eventTarget?: EventTarget | null;
};

const NOOP_PLAYER: SoundPlayer = {
  playCues: () => {},
  play: () => {},
  setMusicPlaying: () => {},
  unlock: () => {},
  isMusicRunning: () => false,
  dispose: () => {},
};

export function createSoundPlayer(options: SoundPlayerOptions = {}): SoundPlayer {
  if (typeof window === 'undefined' && options.eventTarget === undefined) return NOOP_PLAYER;

  let musicWanted = false;
  const engine = createSoundEngine({
    unlockEvents: UNLOCK_EVENTS,
    sfxBusLevel: SFX_BUS_LEVEL,
    musicBusLevel: MUSIC_BUS_LEVEL,
    maxSfxVoices: MAX_SFX_VOICES,
    musicCatchUpSeconds: 0.02,
    onMusicSync: () => syncMusic(),
    createContext: options.createContext,
    now: options.now,
    eventTarget: options.eventTarget,
  });

  function syncMusic(): void {
    if (engine.canPlayMusic() && musicWanted) engine.startMusic({ voicesAt: musicStep, stepSeconds: MUSIC_STEP_SECONDS, wrap: MUSIC_PATTERN_STEPS });
    else engine.stopMusic();
  }

  const playCues = (cues: readonly SoundCue[]) => engine.playRecipes(orderCuesByPriority(cues).map((cue) => ({ kind: cue.kind as SoundCueKind, recipe: recipeFor(cue) })));
  // 구독 시 저장소를 다시 읽었을 수 있으니 한 번 맞춘다
  engine.applySettings();

  return {
    playCues,
    play: (cue) => playCues([cue]),
    setMusicPlaying(on) {
      musicWanted = on;
      syncMusic();
    },
    unlock: engine.unlock,
    isMusicRunning: engine.isMusicRunning,
    dispose: engine.dispose,
  };
}

let singleton: SoundPlayer | null = null;

/** 앱 전체가 함께 쓰는 플레이어 — 서버 렌더에서는 아무것도 하지 않는 플레이어를 돌려준다(캐시하지 않음) */
export function getSoundPlayer(): SoundPlayer {
  if (typeof window === 'undefined') return NOOP_PLAYER;
  if (!singleton) singleton = createSoundPlayer();
  return singleton;
}

/** 테스트 전용 — 싱글턴을 정리하고 비운다 */
export function __resetSoundPlayerForTests(): void {
  singleton?.dispose();
  singleton = null;
}
