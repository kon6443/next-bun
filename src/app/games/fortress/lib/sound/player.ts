/**
 * 포트리스 소리 플레이어(D-025 보충 6) — 테트리스 soundPlayer와 같은 구조. 레시피(recipes.ts)를 Web Audio 노드로 울린다
 * - 게임 공통 소리 설정(_shared/lib/soundSettings, 'games:sound', 기본 꺼짐)을 구독 — 효과음·배경음 켜기/끄기와 음량을 바로 반영
 * - 둘 다 꺼져 있으면 AudioContext를 만들지 않는다. 만들거나 resume하는 것은 사용자 활성화(pointerup·touchend·click·keydown) 안에서만(iOS 자동재생 정책)
 * - 공통 소리 모달이 켜는 클릭에서도 깨운다(_shared/lib/soundUnlock)
 * - 탭이 숨겨지면 배경음을 멈추고 효과음을 버린다(돌아오면 배경음 다시)
 * - 한 번에 몰린 신호는 중요한 것부터 MAX_CUES_PER_CALL개만 — 리플레이·따라잡기 프레임에 소리가 몰려 나지 않게
 */
import { getSoundSettings, subscribeSoundSettings, type SoundSettings } from "@/app/games/_shared/lib/soundSettings";
import { registerSoundUnlock } from "@/app/games/_shared/lib/soundUnlock";
import { createAudioContext, createNoiseBuffer, isAudioHalted, primeAudioContext } from "@/app/games/_shared/lib/webAudio";
import { type FortressCue, type FortressCueKind, MUSIC_STEP_SECONDS, type MusicTrack, type Voice, musicStep, recipeFor } from "./recipes";

export const MAX_SFX_VOICES = 20;
/** 한 번의 playCues에서 울릴 신호 상한 — 넘치면 덜 중요한 것을 버린다 */
export const MAX_CUES_PER_CALL = 4;
const SFX_BUS_LEVEL = 0.8;
const MUSIC_BUS_LEVEL = 0.3;
const MUSIC_LOOKAHEAD_SECONDS = 0.12;
const MUSIC_TICK_MS = 25;
const PARAM_SMOOTHING_SECONDS = 0.02;
const SILENT = 0.0001;
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
  const createContext = options.createContext ?? createAudioContext;
  const now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const eventTarget = options.eventTarget === undefined ? window : options.eventTarget;
  const visibility = options.visibilityTarget === undefined ? (typeof document !== "undefined" ? document : null) : options.visibilityTarget;

  let settings: SoundSettings = getSoundSettings();
  let ctx: AudioContext | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let unlocked = false;
  let listening = false;
  let disposed = false;
  let hidden = visibility?.hidden ?? false;

  let wantedTrack: MusicTrack | null = null;
  let playingTrack: MusicTrack | null = null;
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let nextStepTime = 0;
  let step = 0;
  let musicNodes: { node: AudioScheduledSourceNode; end: number }[] = [];
  let sfxEnds: number[] = [];
  const lastAt = new Map<FortressCueKind, number>();

  const anyEnabled = () => settings.sfx || settings.music;
  const sfxLevel = () => (settings.sfx ? SFX_BUS_LEVEL * settings.sfxVolume : 0);
  const musicLevel = () => (settings.music ? MUSIC_BUS_LEVEL * settings.musicVolume : 0);
  const onGesture = () => unlock();

  function syncListeners(): void {
    const should = !disposed && !unlocked && anyEnabled() && eventTarget !== null;
    if (should === listening || eventTarget === null) return;
    listening = should;
    for (const type of UNLOCK_EVENTS) {
      if (should) eventTarget.addEventListener(type, onGesture, { capture: true, passive: true });
      else eventTarget.removeEventListener(type, onGesture, { capture: true });
    }
  }

  function setParam(param: AudioParam, value: number): void {
    if (!ctx) return;
    try {
      param.cancelScheduledValues(ctx.currentTime);
      param.setTargetAtTime(value, ctx.currentTime, PARAM_SMOOTHING_SECONDS);
    } catch {
      param.value = value;
    }
  }

  function markUnlocked(): void {
    if (disposed || !ctx || ctx.state !== "running" || unlocked) return;
    unlocked = true;
    syncListeners();
    syncMusic();
  }

  function unlock(): void {
    if (disposed || !anyEnabled()) return;
    if (!ctx) {
      ctx = createContext();
      if (!ctx) return;
      const master = ctx.createGain();
      master.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxLevel();
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicLevel();
      musicBus.connect(master);
      primeAudioContext(ctx);
      const context = ctx;
      context.onstatechange = () => {
        if (isAudioHalted(context) && unlocked && anyEnabled()) {
          unlocked = false;
          syncListeners();
        } else markUnlocked();
      };
    }
    if (ctx.state === "running") return markUnlocked();
    try {
      void ctx
        .resume()
        .then(markUnlocked)
        .catch(() => {});
    } catch {
      // resume이 없는 옛 구현 — 다음 조작에서 다시
    }
  }

  function startVoice(context: AudioContext, voice: Voice, at: number, destination: AudioNode) {
    const start = at + voice.start;
    const end = start + voice.duration;
    const env = context.createGain();
    env.gain.setValueAtTime(SILENT, start);
    env.gain.linearRampToValueAtTime(voice.gain, start + Math.min(voice.attack, voice.duration / 2));
    env.gain.exponentialRampToValueAtTime(SILENT, end);
    env.connect(destination);
    let source: AudioScheduledSourceNode;
    let filter: BiquadFilterNode | null = null;
    if (voice.type === "tone") {
      const osc = context.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.freq, start);
      if (voice.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(voice.freqEnd, end);
      if (voice.detune !== undefined) osc.detune.value = voice.detune;
      osc.connect(env);
      source = osc;
    } else {
      const src = context.createBufferSource();
      if (!noiseBuffer) noiseBuffer = createNoiseBuffer(context);
      src.buffer = noiseBuffer;
      src.loop = true;
      filter = context.createBiquadFilter();
      filter.type = voice.filter;
      filter.frequency.setValueAtTime(voice.filterFreq, start);
      if (voice.filterFreqEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(voice.filterFreqEnd, end);
      if (voice.q !== undefined) filter.Q.value = voice.q;
      src.connect(filter);
      filter.connect(env);
      source = src;
    }
    source.onended = () => {
      try {
        source.disconnect();
        filter?.disconnect();
        env.disconnect();
      } catch {
        // 이미 끊김
      }
    };
    source.start(start);
    source.stop(end + 0.02);
    return { node: source, end };
  }

  function playCues(cues: readonly FortressCue[]): void {
    if (disposed || hidden || !settings.sfx || cues.length === 0) return;
    if (!ctx || !sfxBus) return;
    if (ctx.state !== "running") {
      // 멈춘 시계에 예약하면 시작될 때 한꺼번에 난다 — 버린다
      try {
        void ctx.resume().then(markUnlocked).catch(() => {});
      } catch {
        // 무시
      }
      return;
    }
    const t = ctx.currentTime;
    const ms = now();
    sfxEnds = sfxEnds.filter((e) => e > t);
    let played = 0;
    for (const cue of orderCues(cues)) {
      if (played >= MAX_CUES_PER_CALL) return;
      const recipe = recipeFor(cue);
      const last = lastAt.get(cue.kind);
      if (last !== undefined && ms - last < recipe.throttleMs) continue;
      if (sfxEnds.length >= MAX_SFX_VOICES) return;
      lastAt.set(cue.kind, ms);
      played++;
      for (const voice of recipe.voices) {
        if (sfxEnds.length >= MAX_SFX_VOICES) return;
        sfxEnds.push(startVoice(ctx, voice, t + 0.005, sfxBus).end);
      }
    }
  }

  // ── 배경음 ──
  function musicTick(): void {
    if (!ctx || !musicBus || !playingTrack) return;
    const t = ctx.currentTime;
    const stepSec = MUSIC_STEP_SECONDS[playingTrack];
    if (nextStepTime < t) nextStepTime = t + 0.03;
    while (nextStepTime < t + MUSIC_LOOKAHEAD_SECONDS) {
      for (const voice of musicStep(playingTrack, step)) musicNodes.push(startVoice(ctx, voice, nextStepTime, musicBus));
      step++;
      nextStepTime += stepSec;
    }
    musicNodes = musicNodes.filter((n) => n.end > t);
  }
  function stopMusic(): void {
    if (musicTimer !== null) clearInterval(musicTimer);
    musicTimer = null;
    playingTrack = null;
    const t = ctx?.currentTime ?? 0;
    for (const { node } of musicNodes) {
      try {
        node.stop(t);
      } catch {
        // 이미 멈춤
      }
    }
    musicNodes = [];
  }
  function syncMusic(): void {
    const target = !disposed && !hidden && unlocked && ctx !== null && settings.music ? wantedTrack : null;
    if (target === playingTrack) return;
    stopMusic();
    if (!target || !ctx) return;
    playingTrack = target;
    step = 0;
    nextStepTime = ctx.currentTime + 0.05;
    musicTick();
    musicTimer = setInterval(musicTick, MUSIC_TICK_MS);
  }

  function applySettings(): void {
    settings = getSoundSettings();
    if (ctx && sfxBus && musicBus) {
      setParam(sfxBus.gain, sfxLevel());
      setParam(musicBus.gain, musicLevel());
      if (!anyEnabled()) {
        unlocked = false;
        if (ctx.state === "running") void ctx.suspend().catch(() => {});
      }
    }
    syncMusic();
    syncListeners();
  }

  const onVisibility = () => {
    hidden = visibility?.hidden ?? false;
    syncMusic();
  };
  visibility?.addEventListener("visibilitychange", onVisibility);
  const unsubscribe = subscribeSoundSettings(applySettings);
  const unregister = registerSoundUnlock(unlock);
  applySettings();

  return {
    playCues,
    play: (cue) => playCues([cue]),
    setMusic(track) {
      wantedTrack = track;
      syncMusic();
    },
    unlock,
    musicTrack: () => playingTrack,
    dispose() {
      if (disposed) return;
      stopMusic();
      disposed = true;
      syncListeners();
      visibility?.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      unregister();
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      ctx = null;
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

/** 테스트 전용 */
export function __resetFortressSoundForTests(): void {
  singleton?.dispose();
  singleton = null;
}
