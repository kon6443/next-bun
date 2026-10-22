/**
 * 소리 레시피 — 신호(SoundCue)를 합성 파라미터로 바꾸는 순수 함수 모음. Web Audio 호출은 soundPlayer가 한다
 * 네온·전자음 톤으로 짧게. 음 이름 대신 MIDI 번호(69 = A4 = 440Hz)로 적는다
 */
import type { SoundCue, SoundCueKind } from '../effects';

export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

type VoiceTiming = {
  /** 신호 시각 기준 시작 지연(초) */
  start: number;
  /** 소리 길이(초) — 끝에서 0으로 지수 감쇠한다 */
  duration: number;
  /** 최대 음량(0~1, 버스 gain 전) */
  gain: number;
  /** 0에서 최대 음량까지 오르는 시간(초) */
  attack: number;
};

export type ToneVoice = VoiceTiming & {
  type: 'tone';
  wave: Wave;
  freq: number;
  /** 있으면 길이 동안 이 주파수로 쓸어 간다 */
  freqEnd?: number;
  /** cent — 두 음을 살짝 어긋나게 겹쳐 두껍게 만든다 */
  detune?: number;
};

export type NoiseVoice = VoiceTiming & {
  type: 'noise';
  filter: 'lowpass' | 'highpass' | 'bandpass';
  filterFreq: number;
  filterFreqEnd?: number;
  q?: number;
};

export type Voice = ToneVoice | NoiseVoice;

export type SoundRecipe = {
  voices: Voice[];
  /** 같은 종류를 다시 울리기까지 최소 간격(ms) — 자동 반복 이동처럼 잦은 신호가 겹쳐 뭉개지지 않게 */
  throttleMs: number;
};

/** 콤보 음 상승 상한(반음) — 콤보 13부터는 같은 높이 */
export const COMBO_MAX_SEMITONES = 12;

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

type ToneOptions = Partial<Omit<ToneVoice, 'type' | 'freq'>>;

function tone(freq: number, options: ToneOptions = {}): ToneVoice {
  return {
    type: 'tone',
    wave: options.wave ?? 'triangle',
    freq,
    freqEnd: options.freqEnd,
    detune: options.detune,
    start: options.start ?? 0,
    duration: options.duration ?? 0.1,
    gain: options.gain ?? 0.08,
    attack: options.attack ?? 0.005,
  };
}

function note(midi: number, options: ToneOptions = {}): ToneVoice {
  return tone(midiToFreq(midi), options);
}

function noise(filter: NoiseVoice['filter'], filterFreq: number, options: Partial<Omit<NoiseVoice, 'type' | 'filter' | 'filterFreq'>> = {}): NoiseVoice {
  return {
    type: 'noise',
    filter,
    filterFreq,
    filterFreqEnd: options.filterFreqEnd,
    q: options.q,
    start: options.start ?? 0,
    duration: options.duration ?? 0.1,
    gain: options.gain ?? 0.1,
    attack: options.attack ?? 0.003,
  };
}

/** 줄 지우기 — 1~4줄마다 다른 화음, 높을수록 밝고 길다. 4줄은 아르페지오 + 두꺼운 화음 + 반짝임 */
function clearRecipe(lines: number): Voice[] {
  switch (lines) {
    case 1:
      return [note(72, { duration: 0.16, gain: 0.08 }), note(76, { duration: 0.16, gain: 0.07 })];
    case 2:
      return [74, 78, 81].map((m, i) => note(m, { start: i * 0.03, duration: 0.2, gain: 0.07 }));
    case 3:
      return [
        ...[76, 80, 83, 88].map((m, i) => note(m, { start: i * 0.03, duration: 0.24, gain: 0.06 })),
        note(64, { wave: 'sawtooth', duration: 0.24, gain: 0.03 }),
      ];
    default:
      return [
        ...[72, 76, 79, 84, 88, 91].map((m, i) => note(m, { wave: 'square', start: i * 0.045, duration: 0.12, gain: 0.04 })),
        note(84, { wave: 'sawtooth', start: 0.27, duration: 0.45, gain: 0.035, detune: -8 }),
        note(88, { wave: 'sawtooth', start: 0.27, duration: 0.45, gain: 0.035, detune: 8 }),
        note(91, { start: 0.27, duration: 0.45, gain: 0.05 }),
        noise('highpass', 6000, { start: 0.27, duration: 0.3, gain: 0.04 }),
      ];
  }
}

const RECIPES: Record<SoundCueKind, (value: number | undefined) => SoundRecipe> = {
  move: () => ({ voices: [tone(1000, { wave: 'square', duration: 0.02, gain: 0.02 })], throttleMs: 45 }),
  rotate: () => ({ voices: [tone(700, { freqEnd: 1050, duration: 0.05, gain: 0.06 })], throttleMs: 35 }),
  hold: () => ({ voices: [tone(330, { wave: 'sine', freqEnd: 990, duration: 0.14, gain: 0.08, attack: 0.01 })], throttleMs: 100 }),
  hardDrop: () => ({
    voices: [
      noise('lowpass', 600, { filterFreqEnd: 150, duration: 0.12, gain: 0.25 }),
      tone(140, { wave: 'sine', freqEnd: 45, duration: 0.16, gain: 0.35 }),
    ],
    throttleMs: 50,
  }),
  lock: () => ({
    voices: [tone(1600, { duration: 0.03, gain: 0.05 }), noise('highpass', 3000, { duration: 0.02, gain: 0.03 })],
    throttleMs: 40,
  }),
  clear: (value) => ({ voices: clearRecipe(clampInt(value, 1, 4, 1)), throttleMs: 60 }),
  // 티스핀 — 살짝 어긋난 두 톱니파가 위에서 내려앉는 "우웅" + 줄 수만큼 높아지는 블립
  tspin: (value) => {
    const lines = clampInt(value, 0, 3, 0);
    const base = midiToFreq(67 + lines * 2);
    const gain = lines === 0 ? 0.03 : 0.045;
    return {
      voices: [
        tone(base * 1.5, { wave: 'sawtooth', freqEnd: base, duration: 0.18, gain, detune: -12 }),
        tone(base * 1.5, { wave: 'sawtooth', freqEnd: base, duration: 0.18, gain, detune: 12 }),
        tone(base * 2, { wave: 'square', start: 0.09, duration: 0.08, gain: 0.035 }),
      ],
      throttleMs: 80,
    };
  },
  // 콤보 — 단계마다 반음씩 올라간다(상한 COMBO_MAX_SEMITONES)
  combo: (value) => {
    const root = 72 + Math.min(clampInt(value, 1, 99, 1) - 1, COMBO_MAX_SEMITONES);
    return {
      voices: [
        note(root, { wave: 'square', duration: 0.08, gain: 0.04 }),
        note(root + 7, { wave: 'square', start: 0.05, duration: 0.1, gain: 0.04 }),
      ],
      throttleMs: 50,
    };
  },
  // 백투백 — 배음이 맞지 않는 두 음(×2.76)과 좁은 대역 노이즈로 금속성
  b2b: () => ({
    voices: [
      tone(1046, { wave: 'square', duration: 0.22, gain: 0.035 }),
      tone(1046 * 2.76, { duration: 0.25, gain: 0.04 }),
      noise('bandpass', 5000, { q: 8, duration: 0.15, gain: 0.06 }),
    ],
    throttleMs: 100,
  }),
  perfectClear: () => ({
    voices: [
      ...[79, 84, 88, 91].map((m, i) => note(m, { wave: 'square', start: i * 0.08, duration: 0.12, gain: 0.04 })),
      ...[84, 88, 91, 96].map((m) => note(m, { start: 0.32, duration: 0.6, gain: 0.05, attack: 0.01 })),
    ],
    throttleMs: 500,
  }),
  // 레벨업 — 상승 아르페지오, 레벨에 따라 시작음이 조금씩 바뀐다(5단계 순환)
  levelUp: (value) => {
    const root = 67 + ((clampInt(value, 1, 999, 1) - 1) % 5);
    return {
      voices: [0, 4, 7, 12].map((step, i) => note(root + step, { start: i * 0.06, duration: 0.14, gain: 0.07 })),
      throttleMs: 300,
    };
  },
  gameOver: () => ({
    voices: [
      ...[67, 63, 60].map((m, i) => note(m, { start: i * 0.18, duration: 0.25, gain: 0.08 })),
      tone(midiToFreq(55), { start: 0.54, freqEnd: midiToFreq(43), duration: 0.6, gain: 0.08 }),
    ],
    throttleMs: 1000,
  }),
  // 공격 — 위로 쓸어 올리는 "지잉", 보낸 줄이 많을수록 높고 크다
  attack: (value) => {
    const lines = clampInt(value, 1, 10, 1);
    const top = 1400 + Math.min(lines, 6) * 100;
    const gain = 0.03 + Math.min(lines, 6) * 0.004;
    return {
      voices: [
        tone(500, { wave: 'sawtooth', freqEnd: top, duration: 0.16, gain, detune: -10 }),
        tone(500, { wave: 'sawtooth', freqEnd: top, duration: 0.16, gain, detune: 10 }),
        noise('highpass', 4000, { duration: 0.1, gain: 0.03 }),
      ],
      throttleMs: 60,
    };
  },
  // 가비지 — 낮은 경고 버즈, 4줄 이상이면 한 번 더
  garbage: (value) => {
    const pulses = clampInt(value, 1, 99, 1) >= 4 ? 3 : 2;
    return {
      voices: Array.from({ length: pulses }, (_, i) => [
        tone(55, { wave: 'square', start: i * 0.12, duration: 0.09, gain: 0.05 }),
        tone(110, { start: i * 0.12, duration: 0.09, gain: 0.06 }),
      ]).flat(),
      throttleMs: 120,
    };
  },
  ko: () => ({
    voices: [
      noise('lowpass', 3000, { filterFreqEnd: 100, duration: 0.7, gain: 0.35 }),
      tone(90, { wave: 'sine', freqEnd: 30, duration: 0.6, gain: 0.4 }),
    ],
    throttleMs: 300,
  }),
  win: () => ({
    voices: [
      ...[72, 76, 79].map((m, i) => note(m, { wave: 'square', start: i * 0.1, duration: 0.1, gain: 0.04 })),
      note(84, { wave: 'square', start: 0.3, duration: 0.5, gain: 0.04 }),
      ...[76, 79].map((m) => note(m, { start: 0.3, duration: 0.5, gain: 0.05 })),
    ],
    throttleMs: 1000,
  }),
  countdown: () => ({ voices: [tone(660, { wave: 'sine', duration: 0.12, gain: 0.14 })], throttleMs: 300 }),
  go: () => ({
    voices: [tone(1320, { wave: 'sine', duration: 0.3, gain: 0.14 }), tone(660, { duration: 0.3, gain: 0.05 })],
    throttleMs: 300,
  }),
};

/** 신호 하나의 합성 파라미터 — 같은 입력이면 항상 같은 결과 */
export function recipeFor(cue: SoundCue): SoundRecipe {
  return RECIPES[cue.kind](cue.value);
}

// ── 배경음악 — 직접 만든 4마디 아르페지오·베이스 루프(Am - F - C - G) ──

export const MUSIC_BPM = 112;
/** 16분음표 한 칸 길이(초) */
export const MUSIC_STEP_SECONDS = 60 / MUSIC_BPM / 4;
const STEPS_PER_BAR = 16;
const BARS = [
  { arp: [69, 72, 76, 81], bass: 45 },
  { arp: [65, 69, 72, 77], bass: 41 },
  { arp: [67, 72, 76, 79], bass: 48 },
  { arp: [67, 71, 74, 79], bass: 43 },
];
export const MUSIC_PATTERN_STEPS = BARS.length * STEPS_PER_BAR;
/** 8분음표마다 짚는 화음 구성음 순서 */
const ARP_ORDER = [0, 1, 2, 3, 2, 1, 2, 1];
const BASS_STEPS = new Set([0, 6, 8, 14]);

/** 루프의 한 칸(16분음표)에서 낼 음 — 시작 지연은 0 기준 */
export function musicStep(stepIndex: number): Voice[] {
  const step = ((stepIndex % MUSIC_PATTERN_STEPS) + MUSIC_PATTERN_STEPS) % MUSIC_PATTERN_STEPS;
  const bar = BARS[Math.floor(step / STEPS_PER_BAR)];
  const inBar = step % STEPS_PER_BAR;
  const voices: Voice[] = [];
  if (inBar % 2 === 0) {
    voices.push(note(bar.arp[ARP_ORDER[inBar / 2]], { duration: MUSIC_STEP_SECONDS * 1.6, gain: 0.05 }));
  }
  if (BASS_STEPS.has(inBar)) {
    voices.push(note(bar.bass, { wave: 'sine', duration: MUSIC_STEP_SECONDS * 1.8, gain: 0.16, attack: 0.01 }));
  }
  return voices;
}
