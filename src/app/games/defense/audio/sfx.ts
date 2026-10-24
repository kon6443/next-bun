/**
 * 효과음 (defense DESIGN §F9·§F10 사운드) — WebAudio 합성(오실레이터·노이즈), 파일 없음
 * - 기본 꺼짐. 켤 때(사용자 제스처) 처음으로 AudioContext를 만든다 — 꺼진 동안 오디오 자원·자동 재생 경고 0
 * - 마스터 Gain + 컴프레서, 동시 12음 · 종류별 3음 · 같은 종류 최소 간격 50/100/150ms(1·2·3× — 배속이 빠를수록 솎는다)
 * - 일시정지·화면 숨김이면 suspend
 * - 음량은 게임 공통 소리 설정의 효과음 음량(setVolume) — 마스터 gain에 곱한다
 */
import { createAudioContext, createNoiseBuffer, isAudioHalted, primeAudioContext } from '@/app/games/_shared/lib/webAudio';

export const SOUND = {
  FIRE_ARCHER: 0,
  FIRE_CANNON: 1,
  FIRE_MAGE: 2,
  FIRE_FROST: 3,
  FIRE_CROSSBOW: 4,
  FIRE_TESLA: 5,
  HIT: 6,
  EXPLODE: 7,
  DEATH: 8,
  LEAK: 9,
  WAVE_START: 10,
  BOSS: 11,
  BUILD: 12,
  UPGRADE: 13,
  SELL: 14,
  VICTORY: 15,
  DEFEAT: 16,
} as const;
const SOUND_COUNT = 17;

const MAX_VOICES = 12;
/** 음량 1일 때 마스터 gain — 컴프레서 앞에서 겹쳐도 거슬리지 않게 */
const MASTER_LEVEL = 0.8;
const MAX_PER_KIND = 3;
const MIN_INTERVAL_MS: readonly number[] = [50, 100, 150];

type Tone = { type: OscillatorType | 'noise'; from: number; to: number; ms: number; gain: number };

/** 소리마다 1~2개 톤 — 짧고 겹쳐도 거슬리지 않게 작게 */
const TONES: readonly (readonly Tone[])[] = [
  [{ type: 'triangle', from: 880, to: 660, ms: 70, gain: 0.08 }],
  [{ type: 'noise', from: 400, to: 120, ms: 180, gain: 0.18 }, { type: 'sine', from: 120, to: 60, ms: 160, gain: 0.12 }],
  [{ type: 'sine', from: 520, to: 1040, ms: 140, gain: 0.07 }],
  [{ type: 'sine', from: 1400, to: 1800, ms: 120, gain: 0.05 }],
  [{ type: 'square', from: 1200, to: 900, ms: 50, gain: 0.04 }],
  [{ type: 'sawtooth', from: 1600, to: 400, ms: 110, gain: 0.05 }],
  [{ type: 'noise', from: 2000, to: 1200, ms: 40, gain: 0.04 }],
  [{ type: 'noise', from: 600, to: 80, ms: 300, gain: 0.2 }],
  [{ type: 'triangle', from: 300, to: 120, ms: 120, gain: 0.07 }],
  [{ type: 'square', from: 220, to: 180, ms: 260, gain: 0.1 }],
  [{ type: 'sawtooth', from: 220, to: 440, ms: 350, gain: 0.08 }],
  [{ type: 'sawtooth', from: 110, to: 70, ms: 700, gain: 0.14 }],
  [{ type: 'triangle', from: 440, to: 660, ms: 120, gain: 0.09 }],
  [{ type: 'triangle', from: 520, to: 1040, ms: 180, gain: 0.09 }],
  [{ type: 'triangle', from: 660, to: 330, ms: 160, gain: 0.08 }],
  [{ type: 'triangle', from: 523, to: 1046, ms: 600, gain: 0.12 }],
  [{ type: 'sawtooth', from: 330, to: 110, ms: 800, gain: 0.12 }],
];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = false;
  private volume = 1;
  private paused = false;
  private speedIndex = 0;
  private voices = 0;
  private readonly perKind = new Array<number>(SOUND_COUNT).fill(0);
  private readonly lastAt = new Array<number>(SOUND_COUNT).fill(-Infinity);

  /** AudioContext 생성자 — 테스트가 가짜를 넣는다 */
  constructor(private readonly createContext: () => AudioContext | null = createAudioContext) {}

  get created(): boolean {
    return this.ctx !== null;
  }

  /** 켜기·끄기 — 켤 때 처음이면 컨텍스트를 만든다(제스처 안에서 불러야 iOS가 소리를 낸다) */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on && !this.ctx) this.init();
    this.sync();
  }

  /** 효과음 음량 0~1 — 울리던 소리에도 바로 반영 */
  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
    if (this.master) this.master.gain.value = MASTER_LEVEL * this.volume;
  }

  setSpeed(speed: number): void {
    this.speedIndex = Math.max(0, Math.min(MIN_INTERVAL_MS.length - 1, speed - 1));
  }

  /** 일시정지·화면 숨김 */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.sync();
  }

  play(kind: number, now: number): boolean {
    const ctx = this.ctx;
    const master = this.master;
    if (!this.enabled || this.paused || !ctx || !master || ctx.state !== 'running') return false;
    if (this.voices >= MAX_VOICES || this.perKind[kind] >= MAX_PER_KIND) return false;
    if (now - this.lastAt[kind] < MIN_INTERVAL_MS[this.speedIndex]) return false;
    this.lastAt[kind] = now;
    const t0 = ctx.currentTime;
    let longest = 0;
    let last: AudioScheduledSourceNode | null = null;
    for (const tone of TONES[kind]) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(tone.gain, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.ms / 1000);
      gain.connect(master);
      let source: AudioScheduledSourceNode;
      if (tone.type === 'noise') {
        const buffer = ctx.createBufferSource();
        buffer.buffer = this.noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(tone.from, t0);
        filter.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.ms / 1000);
        buffer.connect(filter);
        filter.connect(gain);
        source = buffer;
      } else {
        const osc = ctx.createOscillator();
        osc.type = tone.type;
        osc.frequency.setValueAtTime(tone.from, t0);
        osc.frequency.exponentialRampToValueAtTime(tone.to, t0 + tone.ms / 1000);
        osc.connect(gain);
        source = osc;
      }
      source.start(t0);
      source.stop(t0 + tone.ms / 1000);
      if (tone.ms >= longest) {
        longest = tone.ms;
        last = source;
      }
    }
    this.voices += 1;
    this.perKind[kind] += 1;
    if (last) {
      last.onended = () => {
        this.voices = Math.max(0, this.voices - 1);
        this.perKind[kind] = Math.max(0, this.perKind[kind] - 1);
      };
    }
    return true;
  }

  /** 닫힌 컨텍스트의 음은 onended가 오지 않는다 — 카운터·전환 대기를 비워 같은 인스턴스를 다시 켜도(개발 StrictMode) 상한에 걸리지 않게 */
  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.voices = 0;
    this.perKind.fill(0);
    this.switching = false;
  }

  private init(): void {
    // 오디오를 막은 브라우저·기기는 생성에서 던질 수 있다 — 소리 없이 계속한다(설정·화면은 그대로)
    let ctx: AudioContext | null = null;
    try {
      ctx = this.createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = MASTER_LEVEL * this.volume;
    master.connect(compressor);
    this.master = master;
    // 노이즈 0.5초 — 폭발·명중이 같이 쓴다
    this.noise = createNoiseBuffer(ctx);
    // 만드는 순간은 늘 제스처 안(setEnabled·unlock) — 무음 한 번으로 WebKit 출력 경로를 연다(_shared/lib/webAudio)
    primeAudioContext(ctx);
  }

  /** suspend·resume가 진행 중이면 끝난 뒤 원하는 상태와 다시 맞춘다(빠른 일시정지·재개 경쟁) */
  private switching = false;

  private sync(): void {
    const ctx = this.ctx;
    if (!ctx || this.switching) return;
    const want = this.enabled && !this.paused;
    // iOS는 전화·다른 앱 소리로 'interrupted'가 된다 — running이 아니면 다시 켤 대상
    const change = want ? (isAudioHalted(ctx) ? ctx.resume() : null) : ctx.state === 'running' ? ctx.suspend() : null;
    if (!change) return;
    this.switching = true;
    const settle = () => {
      this.switching = false;
      if (this.ctx === ctx && (this.enabled && !this.paused) !== want) this.sync();
    };
    change.then(settle, settle);
  }

  /** 켜져 있는데 아직 소리가 안 나는 상태(제스처 전 suspended 등) — 다음 제스처에서 resume을 다시 시도한다 */
  get waitingForGesture(): boolean {
    return this.enabled && (!this.ctx || this.ctx.state !== 'running');
  }

  /**
   * 사용자 제스처 안에서 부른다 — 처음이면 만들고, 멈춰 있으면 다시 켠다
   * 제스처 밖에서 부른 resume()은 거절되지 않고 허용될 때까지 settle되지 않는다(Web Audio 명세) — 그 대기(switching)와 상관없이
   * 여기서 직접 resume한다. 성공하면 앞서 기다리던 promise도 함께 풀려 switching이 내려간다
   */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) this.init();
    const ctx = this.ctx;
    if (ctx && !this.paused && isAudioHalted(ctx)) void ctx.resume();
    else this.sync();
  }
}
