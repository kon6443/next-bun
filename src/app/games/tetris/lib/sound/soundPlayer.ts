/**
 * Web Audio 소리 플레이어 — 레시피(recipes.ts)를 실제 노드로 울린다
 * - 효과음·배경음악이 모두 꺼져 있으면 AudioContext를 만들지 않는다(기본 꺼짐)
 * - AudioContext는 사용자 첫 조작(pointerdown·keydown·touchstart) 뒤에만 만들거나 resume한다(iOS 자동재생 정책)
 * - 설정(soundSettings)을 구독해 볼륨·음악 시작/정지를 바로 반영한다
 */
import { createAudioContext, createNoiseBuffer, isAudioHalted } from '@/app/games/_shared/lib/webAudio';
import type { SoundCue, SoundCueKind } from '../effects';
import { MUSIC_PATTERN_STEPS, MUSIC_STEP_SECONDS, musicStep, recipeFor, type Voice } from './recipes';
import { getSoundSettings, subscribeSoundSettings, type SoundSettings } from './soundSettings';

/** 동시에 울리는 효과음 voice 상한 — 넘치면 새 voice를 버린다 */
export const MAX_SFX_VOICES = 24;
const SFX_BUS_LEVEL = 0.8;
const MUSIC_BUS_LEVEL = 0.35;
/** 음악 스케줄러 — 25ms마다 깨어나 0.12초 앞까지 음을 예약한다 */
const MUSIC_LOOKAHEAD_SECONDS = 0.12;
const MUSIC_TICK_MS = 25;
/** gain 변경을 부드럽게(딸깍 소리 방지) */
const PARAM_SMOOTHING_SECONDS = 0.02;
const SILENT = 0.0001;
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

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

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

  const createContext = options.createContext ?? createAudioContext;
  const now = options.now ?? defaultNow;
  const eventTarget = options.eventTarget === undefined ? window : options.eventTarget;

  let settings: SoundSettings = getSoundSettings();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let sfxBus: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  /** 사용자 조작을 한 번 받았는지 — 받은 뒤에는 조작 리스너를 다시 걸지 않는다 */
  let unlocked = false;
  let listening = false;
  let disposed = false;

  let musicWanted = false;
  let musicTimer: ReturnType<typeof setInterval> | null = null;
  let nextStepTime = 0;
  let stepIndex = 0;
  let musicNodes: { node: AudioScheduledSourceNode; end: number }[] = [];

  /** 울리는 중인 효과음 voice의 끝 시각 */
  let sfxVoiceEnds: number[] = [];
  const lastPlayedAt = new Map<SoundCueKind, number>();

  const anyEnabled = () => settings.sfx || settings.music;

  const onGesture = () => unlock();

  function syncGestureListeners(): void {
    const shouldListen = !disposed && !unlocked && anyEnabled() && eventTarget !== null;
    if (shouldListen === listening || eventTarget === null) return;
    listening = shouldListen;
    for (const type of UNLOCK_EVENTS) {
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
    master = context.createGain();
    master.gain.value = settings.volume;
    master.connect(context.destination);
    sfxBus = context.createGain();
    sfxBus.gain.value = SFX_BUS_LEVEL;
    sfxBus.connect(master);
    musicBus = context.createGain();
    musicBus.gain.value = settings.music ? MUSIC_BUS_LEVEL : 0;
    musicBus.connect(master);
  }

  function resumeIfNeeded(): void {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
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
    if (disposed || !ctx || ctx.state !== 'running' || unlocked) return;
    unlocked = true;
    syncGestureListeners();
    syncMusic();
  }

  function unlock(): void {
    if (disposed || !anyEnabled()) return;
    if (!ctx) {
      ctx = createContext();
      if (!ctx) return; // Web Audio 미지원 — 소리 없이 계속
      buildGraph(ctx);
      // 시작된 뒤 다시 멈추면(끄기 직후 켜기 경합·OS가 세션을 멈춤) 조작 리스너를 다시 걸어 다음 조작에서 깨운다
      const context = ctx;
      context.onstatechange = () => {
        // iOS는 전화·다른 앱 오디오로 'interrupted'가 되기도 한다 — running·closed가 아니면 모두 멈춘 것으로 본다
        const halted = isAudioHalted(context);
        if (halted && unlocked && anyEnabled()) {
          unlocked = false;
          syncGestureListeners();
        } else {
          markUnlockedIfRunning();
        }
      };
    }
    if (ctx.state === 'running') {
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

  function getNoiseBuffer(context: AudioContext): AudioBuffer {
    if (!noiseBuffer) noiseBuffer = createNoiseBuffer(context);
    return noiseBuffer;
  }

  /** voice 하나를 예약하고 소스 노드와 끝 시각을 돌려준다 */
  function startVoice(context: AudioContext, voice: Voice, at: number, destination: AudioNode) {
    const start = at + voice.start;
    const end = start + voice.duration;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(SILENT, start);
    envelope.gain.linearRampToValueAtTime(voice.gain, start + Math.min(voice.attack, voice.duration / 2));
    envelope.gain.exponentialRampToValueAtTime(SILENT, end);
    envelope.connect(destination);

    let source: AudioScheduledSourceNode;
    let filter: BiquadFilterNode | null = null;
    if (voice.type === 'tone') {
      const osc = context.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(voice.freq, start);
      if (voice.freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(voice.freqEnd, end);
      if (voice.detune !== undefined) osc.detune.value = voice.detune;
      osc.connect(envelope);
      source = osc;
    } else {
      const src = context.createBufferSource();
      src.buffer = getNoiseBuffer(context);
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

  function playCues(cues: readonly SoundCue[]): void {
    if (disposed || !settings.sfx || cues.length === 0) return;
    if (!ctx || !sfxBus) return; // 아직 사용자 조작 전 — 조작 리스너가 깨운다
    if (ctx.state !== 'running') {
      // 멈춘 시계에 예약하면 시작되는 순간 쌓인 소리가 한꺼번에 난다 — 버리고 시작만 시도한다
      resumeIfNeeded();
      return;
    }
    const t = ctx.currentTime;
    const ms = now();
    sfxVoiceEnds = sfxVoiceEnds.filter((end) => end > t);
    const ordered = orderCuesByPriority(cues);
    for (const cue of ordered) {
      const recipe = recipeFor(cue);
      const last = lastPlayedAt.get(cue.kind);
      if (last !== undefined && ms - last < recipe.throttleMs) continue;
      // 자리가 없으면 그만 — 울리지 않은 소리로 쓰로틀 시각을 남기면 다음 같은 소리가 막힌다 (games-polish FE-18)
      if (sfxVoiceEnds.length >= MAX_SFX_VOICES) return;
      lastPlayedAt.set(cue.kind, ms);
      for (const voice of recipe.voices) {
        if (sfxVoiceEnds.length >= MAX_SFX_VOICES) return; // 남은 신호는 덜 중요한 것들
        sfxVoiceEnds.push(startVoice(ctx, voice, t + 0.005, sfxBus).end);
      }
    }
  }

  // ── 배경음악 ──

  function musicTick(): void {
    if (!ctx || !musicBus) return;
    const t = ctx.currentTime;
    // 탭이 가려져 타이머가 늦어졌으면 밀린 음을 몰아 내지 않고 지금부터 이어 간다
    if (nextStepTime < t) nextStepTime = t + 0.02;
    while (nextStepTime < t + MUSIC_LOOKAHEAD_SECONDS) {
      for (const voice of musicStep(stepIndex)) musicNodes.push(startVoice(ctx, voice, nextStepTime, musicBus));
      nextStepTime += MUSIC_STEP_SECONDS;
      stepIndex = (stepIndex + 1) % MUSIC_PATTERN_STEPS;
    }
    musicNodes = musicNodes.filter((entry) => entry.end > t);
  }

  function startMusic(): void {
    if (musicTimer !== null || !ctx) return;
    nextStepTime = ctx.currentTime + 0.05;
    stepIndex = 0;
    musicTick();
    musicTimer = setInterval(musicTick, MUSIC_TICK_MS);
  }

  function stopMusic(): void {
    if (musicTimer === null) return;
    clearInterval(musicTimer);
    musicTimer = null;
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

  function syncMusic(): void {
    const shouldRun = !disposed && unlocked && ctx !== null && settings.music && musicWanted;
    if (shouldRun) startMusic();
    else stopMusic();
  }

  function applySettings(): void {
    settings = getSoundSettings();
    if (ctx && master && musicBus) {
      setParam(master.gain, settings.volume);
      setParam(musicBus.gain, settings.music ? MUSIC_BUS_LEVEL : 0);
      if (!anyEnabled()) {
        // 모두 껐으면 오디오 장치를 쉬게 한다 — 다시 켜면 다음 조작(또는 토글의 unlock())에서 resume한다
        unlocked = false;
        if (ctx.state === 'running') void ctx.suspend().catch(() => {});
      }
    }
    syncMusic();
    syncGestureListeners();
  }

  const unsubscribe = subscribeSoundSettings(applySettings);
  // 구독 시 저장소를 다시 읽었을 수 있으니 한 번 맞춘다
  applySettings();

  return {
    playCues,
    play: (cue) => playCues([cue]),
    setMusicPlaying(on) {
      musicWanted = on;
      syncMusic();
    },
    unlock,
    isMusicRunning: () => musicTimer !== null,
    dispose() {
      if (disposed) return;
      stopMusic();
      disposed = true;
      syncGestureListeners();
      unsubscribe();
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
      ctx = null;
    },
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
