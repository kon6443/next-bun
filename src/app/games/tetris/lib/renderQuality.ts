import type { EffectQuality } from './effectsRenderer';

/**
 * 그리기 품질 자동 조절 — 화면 프레임(rAF) 간격의 이동 평균으로 판단한다(판 내내 계속 잰다)
 * 오래 하면 기기가 뜨거워져 서서히 느려진다 — 한 번만 재면 처음엔 괜찮다가 나중에 느려지는 것을 못 잡는다
 * 깜빡임 방지: 들어가는 기준(LITE_ENTER_MS)과 나오는 기준(FULL_EXIT_MS)을 다르게 두고(히스테리시스),
 * lite는 최소 유지 시간 동안 그대로 둔다. 복귀하자마자 다시 느려지면 유지 시간을 두 배로 늘린다
 * 한 번의 끊김(GC·네트워크 처리)·띄엄띄엄 오는 끊김으로는 바꾸지 않는다 — 표본마다 상한(MAX_SAMPLE_MS)을 두고, 평균이 기준을 ENTER_STREAK번 연달아 넘어야 lite로
 * 평균이 내려오는 꼬리까지 세므로, 끊김이 몰려 약 0.4초 동안 20fps 수준이면(60Hz에서 50ms 8번) lite로 간다 — 실제로 그만큼 느렸으니 의도한 동작
 * 간격·시각을 받는 순수 함수 — 시계를 쥐지 않는다. 간격은 캔버스마다 따로 잰다(여러 판이 동시에 그려져도 섞이지 않게)
 */

/** 평균 간격이 이보다 길면(약 50fps 미만) lite로 */
export const LITE_ENTER_MS = 20;
/** lite에서 평균 간격이 이보다 짧아야(약 55fps 이상) full로 — 60Hz 화면의 간격은 16.7ms */
export const FULL_EXIT_MS = 18;
/** 평균의 시작값 — 60Hz 화면 프레임. 첫 표본(굽기·준비로 길기 쉽다)이 평균을 정하지 않게 */
const NOMINAL_FRAME_MS = 1000 / 60;
/** 이동 평균 가중치 — 약 30표본(0.5초)에 걸쳐 따라간다 */
const AVERAGE_WEIGHT = 1 / 30;
/** 품질을 바꾼 뒤 다음 판단까지 모을 표본 수 */
export const MIN_SAMPLES = 60;
/** lite 최소 유지 시간 — 복귀 직후 다시 느려질 때마다 두 배, 상한까지 */
export const LITE_HOLD_MS = 10_000;
export const MAX_LITE_HOLD_MS = 5 * 60_000;
/** full로 돌아온 뒤 이 시간 안에 다시 느려지면 "되돌림"으로 본다 */
export const REBOUND_MS = 30_000;
/** 이보다 긴 간격은 멈춘 화면(일시정지·탭 전환)이라 버린다 */
const MAX_GAP_MS = 200;
/** 표본 하나가 평균에 줄 수 있는 최대 간격 — 끊김 한 번이 평균을 튀게 하지 않게 */
const MAX_SAMPLE_MS = 50;
/** lite로 가려면 평균이 기준을 이만큼 연달아 넘어야 한다(약 0.5초) — 끊김 한두 번은 그사이 평균이 내려온다 */
export const ENTER_STREAK = 30;

export type QualityMonitor = {
  quality: EffectQuality;
  /** 화면 프레임 간격 이동 평균(ms) — NOMINAL_FRAME_MS에서 시작 */
  average: number;
  /** 지금 품질로 바꾼 뒤 모은 표본 수 */
  samples: number;
  /** 평균이 LITE_ENTER_MS를 연달아 넘은 표본 수 */
  overStreak: number;
  /** 마지막으로 품질을 바꾼 시각(ms) */
  changedAt: number;
  /** full로 돌아온 시각 — 없으면 null */
  recoveredAt: number | null;
  liteHoldMs: number;
};

export function createQualityMonitor(): QualityMonitor {
  return { quality: 'full', average: NOMINAL_FRAME_MS, samples: 0, overStreak: 0, changedAt: 0, recoveredAt: null, liteHoldMs: LITE_HOLD_MS };
}

function switchTo(monitor: QualityMonitor, quality: EffectQuality, now: number): void {
  monitor.quality = quality;
  monitor.samples = 0;
  monitor.overStreak = 0;
  monitor.changedAt = now;
}

/**
 * 화면 프레임에 그릴 때마다 부른다 — 이번에 쓸 품질을 돌려준다
 * gap: 이 화면 프레임과 같은 캔버스의 직전 화면 프레임(rAF) 사이 간격(ms, 첫 프레임이면 0 이하). now: 지금 시각(ms) — 유지 시간 계산용
 */
export function sampleDraw(monitor: QualityMonitor, gap: number, now: number): EffectQuality {
  // NaN도 여기서 걸러진다
  if (!(gap > 0 && gap <= MAX_GAP_MS)) return monitor.quality;

  const sample = Math.min(gap, MAX_SAMPLE_MS);
  monitor.average += (sample - monitor.average) * AVERAGE_WEIGHT;
  monitor.samples++;
  monitor.overStreak = monitor.average > LITE_ENTER_MS ? monitor.overStreak + 1 : 0;
  if (monitor.samples < MIN_SAMPLES) return monitor.quality;

  if (monitor.quality === 'full' && monitor.overStreak >= ENTER_STREAK) {
    const rebound = monitor.recoveredAt !== null && now - monitor.recoveredAt < REBOUND_MS;
    monitor.liteHoldMs = rebound ? Math.min(monitor.liteHoldMs * 2, MAX_LITE_HOLD_MS) : LITE_HOLD_MS;
    switchTo(monitor, 'lite', now);
  } else if (monitor.quality === 'lite' && monitor.average < FULL_EXIT_MS && now - monitor.changedAt >= monitor.liteHoldMs) {
    monitor.recoveredAt = now;
    switchTo(monitor, 'full', now);
  }
  return monitor.quality;
}
