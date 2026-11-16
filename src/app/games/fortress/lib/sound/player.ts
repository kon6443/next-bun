/**
 * 포트리스 소리 플레이어(D-025 보충 6) — 레시피(recipes.ts)를 공용 소리 엔진(_shared/lib/soundEngine, 테트리스와 같은 엔진)으로 울린다
 * - 게임 공통 소리 설정(_shared/lib/soundSettings, 'games:sound', 기본 꺼짐)을 구독 — 효과음·배경음 켜기/끄기와 음량을 바로 반영
 * - 둘 다 꺼져 있으면 AudioContext를 만들지 않는다. 만들거나 resume하는 것은 사용자 활성화(pointerup·touchend·click·keydown) 안에서만(iOS 자동재생 정책)
 * - 공통 소리 모달이 켜는 클릭에서도 깨운다(_shared/lib/soundUnlock)
 * - 탭이 숨겨지면 배경음을 멈추고 효과음을 버린다(돌아오면 배경음 다시)
 * - 한 번에 몰린 신호는 중요한 것부터 MAX_CUES_PER_CALL개만 — 리플레이·따라잡기 프레임에 소리가 몰려 나지 않게
 */
import { createSoundEngine } from "@/app/games/_shared/lib/soundEngine";
import { type FortressCue, type FortressCueKind, MUSIC_STEP_SECONDS, type MusicTrack, musicStep, recipeFor } from "./recipes";

export const MAX_SFX_VOICES = 20;
/** 한 번의 playCues에서 울릴 신호 상한 — 넘치면 덜 중요한 것을 버린다 */
export const MAX_CUES_PER_CALL = 4;
const SFX_BUS_LEVEL = 0.8;
const MUSIC_BUS_LEVEL = 0.3;
/** 사용자 활성화를 주는 이벤트 — 터치의 pointerdown은 활성화가 아니다(테트리스·디펜스와 같다) */
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

/** 작을수록 중요 — 승패·격파·큰 폭발이 버튼·충전음에 밀리지 않게 */
const PRIORITY: Record<FortressCueKind, number> = { win: 0, lose: 0, death: 1, explode: 2, fire: 3, hit: 3, myTurn: 4, turn: 5, weapon: 6, charge: 6, button: 7 };

/** 중요한 신호가 앞(같은 중요도는 큰 폭발 먼저, 그다음 들어온 순서) */
export function orderCues(cues: readonly FortressCue[]): FortressCue[] {
  const rank = (c: FortressCue) => PRIORITY[c.kind] * 1000 - (c.kind === "explode" ? c.radius : 0);
  return cues
    .map((cue, i) => ({ cue, i }))
    .sort((a, b) => rank(a.cue) - rank(b.cue) || a.i - b.i)
    .map((x) => x.cue);
}

export type FortressSoundPlayer = {
  /** 한 프레임에 쌓인 신호 — 효과음이 꺼졌거나 아직 조작 전·탭 숨김이면 버린다 */
  playCues(cues: readonly FortressCue[]): void;
  play(cue: FortressCue): void;
  /** 화면이 원하는 배경음(없으면 null) — 설정의 music이 꺼져 있으면 울리지 않는다 */
  setMusic(track: MusicTrack | null): void;
  unlock(): void;
  /** 지금 울리는 배경음(테스트·표시용) */
  musicTrack(): MusicTrack | null;
  dispose(): void;
};

export type FortressSoundOptions = {
  createContext?: () => AudioContext | null;
  now?: () => number;
  /** 조작·화면 숨김 이벤트를 받을 대상 — 기본 window·document */
  eventTarget?: EventTarget | null;
  visibilityTarget?: { hidden: boolean; addEventListener: Document["addEventListener"]; removeEventListener: Document["removeEventListener"] } | null;
};

const NOOP: FortressSoundPlayer = { playCues: () => {}, play: () => {}, setMusic: () => {}, unlock: () => {}, musicTrack: () => null, dispose: () => {} };

export function createFortressSound(options: FortressSoundOptions = {}): FortressSoundPlayer {
  if (typeof window === "undefined" && options.eventTarget === undefined) return NOOP;
  const visibility = options.visibilityTarget === undefined ? (typeof document !== "undefined" ? document : null) : options.visibilityTarget;

  let wantedTrack: MusicTrack | null = null;
  let playingTrack: MusicTrack | null = null;
  const engine = createSoundEngine({
    unlockEvents: UNLOCK_EVENTS,
    sfxBusLevel: SFX_BUS_LEVEL,
    musicBusLevel: MUSIC_BUS_LEVEL,
    maxSfxVoices: MAX_SFX_VOICES,
    maxCuesPerCall: MAX_CUES_PER_CALL,
    musicCatchUpSeconds: 0.03,
    onMusicSync: () => syncMusic(),
    createContext: options.createContext,
    now: options.now,
    eventTarget: options.eventTarget,
    visibilityTarget: visibility,
  });

  /** 원하는 곡이 지금 울릴 수 있으면 그 곡으로(곡이 바뀌면 처음부터), 아니면 멈춘다 */
  function syncMusic(): void {
    const target = engine.canPlayMusic() ? wantedTrack : null;
    if (target === playingTrack) return;
    engine.stopMusic();
    playingTrack = null;
    if (!target) return;
    playingTrack = target;
    engine.startMusic({ voicesAt: (step) => musicStep(target, step), stepSeconds: MUSIC_STEP_SECONDS[target] });
  }

  const playCues = (cues: readonly FortressCue[]) => engine.playRecipes(orderCues(cues).map((cue) => ({ kind: cue.kind, recipe: recipeFor(cue) })));
  engine.applySettings();

  return {
    playCues,
    play: (cue) => playCues([cue]),
    setMusic(track) {
      wantedTrack = track;
      syncMusic();
    },
    unlock: engine.unlock,
    musicTrack: () => playingTrack,
    dispose() {
      engine.dispose();
      playingTrack = null;
    },
  };
}

let singleton: FortressSoundPlayer | null = null;

/** 앱 전체가 함께 쓰는 포트리스 플레이어 — 서버 렌더에서는 아무것도 하지 않는다 */
export function getFortressSound(): FortressSoundPlayer {
  if (typeof window === "undefined") return NOOP;
  if (!singleton) singleton = createFortressSound();
  return singleton;
}
