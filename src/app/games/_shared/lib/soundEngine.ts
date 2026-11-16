/**
 * 게임 소리 엔진(공용) — 레시피의 voice를 Web Audio 노드로 울리는 부분과 켜기·깨우기 규칙. 테트리스·포트리스 플레이어가 함께 쓴다
 * - 게임 공통 소리 설정(soundSettings)을 구독 — 효과음·배경음 켜기/끄기와 음량을 바로 반영(울리던 소리 포함)
 * - 둘 다 꺼져 있으면 AudioContext를 만들지 않는다. 만들거나 resume하는 것은 사용자 조작 안에서만(iOS 자동재생 정책),
 *   컨텍스트가 실제로 running이 될 때까지 조작 리스너를 떼지 않는다. 공통 소리 모달의 클릭에서도 깨운다(soundUnlock)
 * - visibility를 주면 탭이 숨겨진 동안 효과음을 버리고 배경음을 멈추게 한다(canPlayMusic이 false)
 * 무엇을 언제 울릴지(신호 순서·한 번에 몇 개·어느 곡)는 게임 플레이어가 정한다
 */
import { createAudioContext, createNoiseBuffer, isAudioHalted, primeAudioContext } from "./webAudio";
import { getSoundSettings, subscribeSoundSettings, type SoundSettings } from "./soundSettings";
import { registerSoundUnlock } from "./soundUnlock";

/** gain 변경을 부드럽게(딸깍 소리 방지) */
const PARAM_SMOOTHING_SECONDS = 0.02;
const SILENT = 0.0001;
/** 음악 스케줄러 — 25ms마다 깨어나 0.12초 앞까지 음을 예약한다 */
const MUSIC_LOOKAHEAD_SECONDS = 0.12;
const MUSIC_TICK_MS = 25;

type VoiceTiming = { start: number; duration: number; gain: number; attack: number };
export type EngineVoice =
  | (VoiceTiming & { type: "tone"; wave: OscillatorType; freq: number; freqEnd?: number; detune?: number })
  | (VoiceTiming & { type: "noise"; filter: BiquadFilterType; filterFreq: number; filterFreqEnd?: number; q?: number });

export type EngineRecipe = { voices: readonly EngineVoice[]; throttleMs: number };

type VisibilityTarget = { hidden: boolean; addEventListener: Document["addEventListener"]; removeEventListener: Document["removeEventListener"] };

export type SoundEngineOptions = {
  /** 오디오 시작을 시도할 조작 이벤트 */
  unlockEvents: readonly string[];
  sfxBusLevel: number;
  musicBusLevel: number;
  /** 동시에 울리는 효과음 voice 상한 — 넘치면 새 voice를 버린다 */
  maxSfxVoices: number;
  /** 한 번의 playRecipes에서 울릴 신호 상한(없으면 voice 상한까지) */
  maxCuesPerCall?: number;
  /** 탭이 늦어 밀린 음을 몰아 내지 않고 지금부터 이을 때의 여유(초) */
  musicCatchUpSeconds: number;
  /** 배경음이 바뀌어야 할 수 있을 때(조작으로 깨어남·설정·탭 숨김) — 게임이 canPlayMusic을 보고 곡을 맞춘다 */
  onMusicSync: () => void;
  createContext?: () => AudioContext | null;
  now?: () => number;
  eventTarget?: EventTarget | null;
  /** 주면 탭 숨김을 본다(없으면 보지 않는다) */
  visibilityTarget?: VisibilityTarget | null;
};

export type SoundEngine = {
  /** 신호 순서대로 레시피를 울린다(같은 종류는 throttleMs 안에 다시 울리지 않는다) — 꺼짐·조작 전·숨김이면 버린다 */
  playRecipes<K>(items: readonly { kind: K; recipe: EngineRecipe }[]): void;
  unlock(): void;
  canPlayMusic(): boolean;
  /** 배경음 스케줄러 — voicesAt(i)를 stepSeconds 간격으로 예약(wrap이 있으면 i를 그만큼에서 되돌린다) */
  startMusic(track: { voicesAt: (step: number) => readonly EngineVoice[]; stepSeconds: number; wrap?: number }): void;
  stopMusic(): void;
  isMusicRunning(): boolean;
  /** 설정을 다시 읽어 음량·배경음·조작 리스너를 맞춘다 — 플레이어가 자기 상태를 만든 뒤 한 번 부른다(구독 시 저장소를 다시 읽었을 수 있다) */
  applySettings(): void;
  dispose(): void;
};

export function createSoundEngine(options: SoundEngineOptions): SoundEngine {
  const createContext = options.createContext ?? createAudioContext;
  const now = options.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const eventTarget = options.eventTarget === undefined ? window : options.eventTarget;
  const visibility = options.visibilityTarget ?? null;

  let settings: SoundSettings = getSoundSettings();
  let ctx: AudioContext | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  /** 사용자 조작으로 컨텍스트가 running이 됐는지 — 된 뒤에는 조작 리스너를 다시 걸지 않는다 */
  let unlocked = false;
  let listening = false;
  let disposed = false;
  let hidden = visibility?.hidden ?? false;

  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let nextStepTime = 0;
  let stepIndex = 0;
  let musicNodes: { node: AudioScheduledSourceNode; end: number }[] = [];
  let sfxVoiceEnds: number[] = [];
  const lastPlayedAt = new Map<unknown, number>();

  const anyEnabled = () => settings.sfx || settings.music;
  const sfxLevel = () => (settings.sfx ? options.sfxBusLevel * settings.sfxVolume : 0);
  const musicLevel = () => (settings.music ? options.musicBusLevel * settings.musicVolume : 0);
  const onGesture = () => unlock();

  function syncGestureListeners(): void {
    const shouldListen = !disposed && !unlocked && anyEnabled() && eventTarget !== null;
    if (shouldListen === listening || eventTarget === null) return;
    listening = shouldListen;
    for (const type of options.unlockEvents) {
      if (shouldListen) eventTarget.addEventListener(type, onGesture, { capture: true, passive: true });
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

  function buildGraph(context: AudioContext): void {
    const master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
    sfxBus = context.createGain();
    sfxBus.gain.value = sfxLevel();
    sfxBus.connect(master);
    musicBus = context.createGain();
    musicBus.gain.value = musicLevel();
    musicBus.connect(master);
  }

  function resumeIfNeeded(): void {
    if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
    try {
      // 조작 밖에서도 브라우저가 허락하면(이전 조작 이력) 바로 시작된 것으로 처리 — 음악도 함께 맞춘다
      void ctx
        .resume()
        .then(markUnlockedIfRunning)
        .catch(() => {});
    } catch {
      // resume이 없는 옛 구현 — 다음 조작에서 다시 시도한다
    }
  }

  /** 컨텍스트가 실제로 running이 된 뒤에만 시작된 것으로 본다 — 그 전에는 조작 리스너가 다시 시도한다 */
  function markUnlockedIfRunning(): void {
    if (disposed || !ctx || ctx.state !== "running" || unlocked) return;
    unlocked = true;
    syncGestureListeners();
    options.onMusicSync();
  }

  function unlock(): void {
    if (disposed || !anyEnabled()) return;
    if (!ctx) {
      ctx = createContext();
      if (!ctx) return; // Web Audio 미지원 — 소리 없이 계속
      buildGraph(ctx);
      // 제스처 안에서 무음 한 번 — WebKit이 출력 경로를 연다(webAudio)
      primeAudioContext(ctx);
      // 시작된 뒤 다시 멈추면(끄기 직후 켜기 경합·OS가 세션을 멈춤) 조작 리스너를 다시 걸어 다음 조작에서 깨운다
      const context = ctx;
      context.onstatechange = () => {
        // iOS는 전화·다른 앱 오디오로 'interrupted'가 되기도 한다 — running·closed가 아니면 모두 멈춘 것으로 본다
        if (isAudioHalted(context) && unlocked && anyEnabled()) {
          unlocked = false;
          syncGestureListeners();
        } else markUnlockedIfRunning();
      };
    }
    if (ctx.state === "running") {
      markUnlockedIfRunning();
      return;
    }
    try {
      void ctx
        .resume()
        .then(markUnlockedIfRunning)
        .catch(() => {});
    } catch {
      // resume이 없는 옛 구현 — 다음 조작에서 다시 시도한다
    }
  }

  /** voice 하나를 예약하고 소스 노드와 끝 시각을 돌려준다 */
  function startVoice(context: AudioContext, voice: EngineVoice, at: number, destination: AudioNode) {
    const start = at + voice.start;
    const end = start + voice.duration;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(SILENT, start);
    envelope.gain.linearRampToValueAtTime(voice.gain, start + Math.min(voice.attack, voice.duration / 2));
    envelope.gain.exponentialRampToValueAtTime(SILENT, end);
    envelope.connect(destination);
    let source: AudioScheduledSourceNode;
    let filter: BiquadFilterNode | null = null;
    if (voice.type === "tone") {
      const osc = context.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.freq, start);
      if (voice.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(voice.freqEnd, end);
      if (voice.detune !== undefined) osc.detune.value = voice.detune;
      osc.connect(envelope);
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
      filter.connect(envelope);
      source = src;
    }
    source.onended = () => {
      try {
        source.disconnect();
        filter?.disconnect();
        envelope.disconnect();
      } catch {
        // 이미 끊긴 노드
      }
    };
    source.start(start);
    source.stop(end + 0.02);
    return { node: source, end };
  }

  function playRecipes<K>(items: readonly { kind: K; recipe: EngineRecipe }[]): void {
    if (disposed || hidden || !settings.sfx || items.length === 0) return;
    if (!ctx || !sfxBus) return; // 아직 사용자 조작 전 — 조작 리스너가 깨운다
    if (ctx.state !== "running") {
      // 멈춘 시계에 예약하면 시작되는 순간 쌓인 소리가 한꺼번에 난다 — 버리고 시작만 시도한다
      resumeIfNeeded();
      return;
    }
    const t = ctx.currentTime;
    const ms = now();
    sfxVoiceEnds = sfxVoiceEnds.filter((end) => end > t);
    let played = 0;
    for (const { kind, recipe } of items) {
      if (options.maxCuesPerCall !== undefined && played >= options.maxCuesPerCall) return;
      const last = lastPlayedAt.get(kind);
      if (last !== undefined && ms - last < recipe.throttleMs) continue;
      // 자리가 없으면 그만 — 울리지 않은 소리로 쓰로틀 시각을 남기면 다음 같은 소리가 막힌다 (games-polish FE-18)
      if (sfxVoiceEnds.length >= options.maxSfxVoices) return;
      lastPlayedAt.set(kind, ms);
      played++;
      for (const voice of recipe.voices) {
        if (sfxVoiceEnds.length >= options.maxSfxVoices) return; // 남은 신호는 덜 중요한 것들
        sfxVoiceEnds.push(startVoice(ctx, voice, t + 0.005, sfxBus).end);
      }
    }
  }

  // ── 배경음 ──
  let track: { voicesAt: (step: number) => readonly EngineVoice[]; stepSeconds: number; wrap?: number } | null = null;

  function musicTick(): void {
    if (!ctx || !musicBus || !track) return;
    const t = ctx.currentTime;
    // 탭이 가려져 타이머가 늦어졌으면 밀린 음을 몰아 내지 않고 지금부터 이어 간다
    if (nextStepTime < t) nextStepTime = t + options.musicCatchUpSeconds;
    while (nextStepTime < t + MUSIC_LOOKAHEAD_SECONDS) {
      for (const voice of track.voicesAt(stepIndex)) musicNodes.push(startVoice(ctx, voice, nextStepTime, musicBus));
      nextStepTime += track.stepSeconds;
      stepIndex = track.wrap ? (stepIndex + 1) % track.wrap : stepIndex + 1;
    }
    musicNodes = musicNodes.filter((entry) => entry.end > t);
  }

  function startMusic(next: { voicesAt: (step: number) => readonly EngineVoice[]; stepSeconds: number; wrap?: number }): void {
    if (musicTimer !== null || !ctx) return;
    track = next;
    nextStepTime = ctx.currentTime + 0.05;
    stepIndex = 0;
    musicTick();
    musicTimer = setInterval(musicTick, MUSIC_TICK_MS);
  }

  function stopMusic(): void {
    if (musicTimer === null) return;
    clearInterval(musicTimer);
    musicTimer = null;
    track = null;
    const t = ctx?.currentTime ?? 0;
    for (const { node } of musicNodes) {
      try {
        node.stop(t);
      } catch {
        // 이미 멈춘 노드
      }
    }
    musicNodes = [];
  }

  function applySettings(): void {
    settings = getSoundSettings();
    if (ctx && sfxBus && musicBus) {
      setParam(sfxBus.gain, sfxLevel());
      setParam(musicBus.gain, musicLevel());
      if (!anyEnabled()) {
        // 모두 껐으면 오디오 장치를 쉬게 한다 — 다시 켜면 다음 조작(또는 토글의 unlock())에서 resume한다
        unlocked = false;
        if (ctx.state === "running") void ctx.suspend().catch(() => {});
      }
    }
    options.onMusicSync();
    syncGestureListeners();
  }

  const onVisibility = () => {
    hidden = visibility?.hidden ?? false;
    options.onMusicSync();
  };
  visibility?.addEventListener("visibilitychange", onVisibility);
  const unsubscribe = subscribeSoundSettings(applySettings);
  const unregisterUnlock = registerSoundUnlock(unlock);

  return {
    playRecipes,
    unlock,
    canPlayMusic: () => !disposed && !hidden && unlocked && ctx !== null && settings.music,
    startMusic,
    stopMusic,
    isMusicRunning: () => musicTimer !== null,
    applySettings,
    dispose() {
      if (disposed) return;
      stopMusic();
      disposed = true;
      syncGestureListeners();
      visibility?.removeEventListener("visibilitychange", onVisibility);
      unsubscribe();
      unregisterUnlock();
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      ctx = null;
    },
  };
}
