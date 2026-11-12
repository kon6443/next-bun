/**
 * 포트리스 소리 레시피(D-025 보충 6) — 신호(FortressCue)를 합성 파라미터로 바꾸는 순수 함수. Web Audio 호출은 player가 한다
 * 테트리스(tetris/lib/sound/recipes)와 같은 방식 — 음원 파일 없이 오실레이터·노이즈 합성. 포격전이라 낮고 둥근 쿵·휘익 톤
 */

export type Wave = "sine" | "square" | "sawtooth" | "triangle";

type VoiceTiming = {
  /** 신호 시각 기준 시작 지연(초) */
  start: number;
  /** 길이(초) — 끝에서 0으로 지수 감쇠 */
  duration: number;
  /** 최대 음량(0~1, 버스 gain 전) */
  gain: number;
  /** 최대 음량까지 오르는 시간(초) */
  attack: number;
};
export type ToneVoice = VoiceTiming & { type: "tone"; wave: Wave; freq: number; freqEnd?: number; detune?: number };
export type NoiseVoice = VoiceTiming & { type: "noise"; filter: "lowpass" | "highpass" | "bandpass"; filterFreq: number; filterFreqEnd?: number; q?: number };
export type Voice = ToneVoice | NoiseVoice;

/** 무기 연출 종류(renderer/vivid WeaponFx.kind와 같은 이름) */
export type WeaponKind = "shell" | "triple" | "heavy" | "split" | "mega" | "strike";

export type FortressCue =
  | { kind: "fire"; weapon: WeaponKind }
  | { kind: "explode"; weapon: WeaponKind; /** 엔진 폭발 반지름(월드 px) */ radius: number }
  | { kind: "hit"; /** 입은 피해 */ amount: number }
  | { kind: "death" }
  | { kind: "turn" }
  | { kind: "myTurn" }
  | { kind: "weapon" }
  | { kind: "charge" }
  | { kind: "win" }
  | { kind: "lose" }
  | { kind: "button" };
export type FortressCueKind = FortressCue["kind"];

export type SoundRecipe = { voices: Voice[]; /** 같은 종류 최소 간격(ms) — 몰려 울리지 않게 */ throttleMs: number };

export function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const tone = (freq: number, o: Partial<Omit<ToneVoice, "type" | "freq">> = {}): ToneVoice => ({ type: "tone", wave: o.wave ?? "triangle", freq, freqEnd: o.freqEnd, detune: o.detune, start: o.start ?? 0, duration: o.duration ?? 0.15, gain: o.gain ?? 0.3, attack: o.attack ?? 0.005 });
const noise = (filter: NoiseVoice["filter"], filterFreq: number, o: Partial<Omit<NoiseVoice, "type" | "filter" | "filterFreq">> = {}): NoiseVoice => ({ type: "noise", filter, filterFreq, filterFreqEnd: o.filterFreqEnd, q: o.q, start: o.start ?? 0, duration: o.duration ?? 0.2, gain: o.gain ?? 0.3, attack: o.attack ?? 0.004 });

/** 발사 — 쿵(저음 사인 하강) + 포구 바람(노이즈). 무기마다 높이·두께가 다르다 */
function fire(weapon: WeaponKind): Voice[] {
  const base: Record<WeaponKind, { f: number; g: number; d: number }> = {
    shell: { f: 120, g: 0.5, d: 0.22 },
    triple: { f: 170, g: 0.36, d: 0.12 },
    heavy: { f: 85, g: 0.6, d: 0.32 },
    split: { f: 140, g: 0.45, d: 0.2 },
    mega: { f: 60, g: 0.7, d: 0.5 },
    strike: { f: 200, g: 0.3, d: 0.16 },
  };
  const b = base[weapon];
  const voices: Voice[] = [tone(b.f, { wave: "sine", freqEnd: b.f * 0.45, duration: b.d, gain: b.g }), noise("lowpass", 1800, { filterFreqEnd: 300, duration: b.d * 0.9, gain: b.g * 0.6 })];
  if (weapon === "triple") voices.push(tone(b.f, { wave: "sine", freqEnd: b.f * 0.5, start: 0.07, duration: b.d, gain: b.g * 0.8 }), tone(b.f, { wave: "sine", freqEnd: b.f * 0.5, start: 0.14, duration: b.d, gain: b.g * 0.7 }));
  if (weapon === "mega") voices.push(tone(220, { wave: "sawtooth", freqEnd: 70, duration: 0.45, gain: 0.12, detune: 12 }));
  if (weapon === "strike") voices.push(tone(1200, { wave: "sine", freqEnd: 500, start: 0.05, duration: 0.5, gain: 0.08 }));
  return voices;
}

/** 폭발 — 크기(반지름)에 따라 낮고 길게. 노이즈 쿵 + 저음 붐 + (큰 폭발) 잔향 */
function explode(weapon: WeaponKind, radius: number): Voice[] {
  const k = Math.min(1, Math.max(0, (radius - 20) / 70)); // 20 → 0, 90(메가) → 1
  const dur = 0.35 + k * 0.9;
  const voices: Voice[] = [
    noise("lowpass", 2600 - k * 1200, { filterFreqEnd: 120, duration: dur, gain: 0.55 + k * 0.25 }),
    tone(90 - k * 40, { wave: "sine", freqEnd: 32, duration: dur * 0.9, gain: 0.55 + k * 0.2 }),
  ];
  if (k > 0.35) voices.push(noise("bandpass", 420, { start: 0.06, duration: dur * 1.3, gain: 0.18 + k * 0.12, q: 0.7 }));
  if (weapon === "split") voices.push(tone(880, { wave: "triangle", freqEnd: 1320, duration: 0.12, gain: 0.08 }));
  if (weapon === "triple") voices.push(noise("highpass", 3000, { duration: 0.08, gain: 0.12 }));
  return voices;
}

export function recipeFor(cue: FortressCue): SoundRecipe {
  switch (cue.kind) {
    case "fire":
      return { voices: fire(cue.weapon), throttleMs: 60 };
    case "explode":
      // 3연발·분열·폭격은 짧은 간격으로 여러 번 — 쓰로틀을 짧게
      return { voices: explode(cue.weapon, cue.radius), throttleMs: 45 };
    case "hit": {
      const big = cue.amount >= 30;
      return { voices: [tone(big ? 330 : 440, { wave: "square", freqEnd: big ? 160 : 260, duration: 0.14, gain: 0.14 }), noise("highpass", 2400, { duration: 0.06, gain: 0.16 })], throttleMs: 70 };
    }
    case "death":
      return { voices: [noise("lowpass", 1400, { filterFreqEnd: 80, duration: 1.1, gain: 0.6 }), tone(70, { wave: "sine", freqEnd: 28, duration: 1, gain: 0.6 }), tone(midiToFreq(52), { wave: "sawtooth", freqEnd: midiToFreq(40), start: 0.05, duration: 0.6, gain: 0.08 })], throttleMs: 200 };
    case "turn":
      return { voices: [tone(midiToFreq(72), { duration: 0.08, gain: 0.12 }), tone(midiToFreq(76), { start: 0.07, duration: 0.1, gain: 0.1 })], throttleMs: 300 };
    case "myTurn":
      return { voices: [tone(midiToFreq(72), { wave: "square", duration: 0.09, gain: 0.1 }), tone(midiToFreq(76), { wave: "square", start: 0.08, duration: 0.09, gain: 0.1 }), tone(midiToFreq(79), { wave: "square", start: 0.16, duration: 0.18, gain: 0.12 })], throttleMs: 400 };
    case "weapon":
      return { voices: [tone(midiToFreq(84), { duration: 0.05, gain: 0.1 }), noise("bandpass", 3200, { duration: 0.04, gain: 0.08, q: 2 })], throttleMs: 50 };
    case "charge":
      return { voices: [tone(220, { wave: "sawtooth", freqEnd: 660, duration: 0.5, gain: 0.05, attack: 0.05 })], throttleMs: 300 };
    case "win":
      return { voices: [72, 76, 79, 84].map((m, i) => tone(midiToFreq(m), { wave: "square", start: i * 0.12, duration: i === 3 ? 0.5 : 0.14, gain: 0.12 })), throttleMs: 1000 };
    case "lose":
      return { voices: [67, 63, 60].map((m, i) => tone(midiToFreq(m), { wave: "triangle", start: i * 0.18, duration: i === 2 ? 0.6 : 0.2, gain: 0.14 })), throttleMs: 1000 };
    case "button":
      return { voices: [tone(midiToFreq(88), { duration: 0.035, gain: 0.07 })], throttleMs: 40 };
  }
}

// ── 배경음 — 16스텝 반복. match = 경쾌한 행진(베이스 + 아르페지오), result = 느린 화음 ──

export type MusicTrack = "match" | "result";
export const MUSIC_STEPS = 16;
export const MUSIC_STEP_SECONDS: Record<MusicTrack, number> = { match: 0.16, result: 0.32 };

const MATCH_BASS = [43, 43, 50, 43, 41, 41, 48, 41, 38, 38, 45, 38, 43, 43, 50, 47];
const MATCH_LEAD = [67, 71, 74, 71, 65, 69, 72, 69, 62, 66, 69, 66, 67, 71, 74, 79];
const RESULT_CHORDS = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];

/** 배경음 한 스텝의 음 — 스텝 번호는 계속 늘어나고 16으로 돈다 */
export function musicStep(track: MusicTrack, step: number): Voice[] {
  const i = ((step % MUSIC_STEPS) + MUSIC_STEPS) % MUSIC_STEPS;
  const s = MUSIC_STEP_SECONDS[track];
  if (track === "match") {
    const voices: Voice[] = [];
    if (i % 2 === 0) voices.push(tone(midiToFreq(MATCH_BASS[i]), { wave: "triangle", duration: s * 1.8, gain: 0.28 }));
    voices.push(tone(midiToFreq(MATCH_LEAD[i]), { wave: "square", duration: s * 0.7, gain: 0.07 }));
    if (i % 4 === 0) voices.push(noise("lowpass", 180, { duration: 0.09, gain: 0.25 }));
    if (i % 4 === 2) voices.push(noise("highpass", 5000, { duration: 0.04, gain: 0.07 }));
    return voices;
  }
  if (i % 4 !== 0) return [];
  return RESULT_CHORDS[i / 4].map((m) => tone(midiToFreq(m), { wave: "sine", duration: s * 4, gain: 0.12, attack: 0.08 }));
}
