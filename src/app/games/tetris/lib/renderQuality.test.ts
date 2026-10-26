import { describe, it, expect } from 'vitest';
import {
  FULL_EXIT_MS,
  LITE_ENTER_MS,
  LITE_HOLD_MS,
  MAX_LITE_HOLD_MS,
  MIN_SAMPLES,
  type QualityMonitor,
  createQualityMonitor,
  sampleDraw,
} from './renderQuality';

const FAST = 1000 / 60;
const SLOW = 25;

/** 같은 간격으로 count번 그린다 — 마지막 시각을 돌려준다 */
function run(monitor: QualityMonitor, start: number, gap: number, count: number): number {
  let now = start;
  for (let i = 0; i < count; i++) {
    now += gap;
    sampleDraw(monitor, gap, now);
  }
  return now;
}

describe('그리기 품질 자동 조절 (renderQuality)', () => {
  it('60Hz로 잘 그려지면 오래 해도 full', () => {
    const m = createQualityMonitor();
    run(m, 0, FAST, 60 * 60 * 10);
    expect(m.quality).toBe('full');
  });

  it('처음엔 괜찮다가 나중에 느려져도(발열) lite로 간다 — 한 번만 재고 끝나지 않는다', () => {
    const m = createQualityMonitor();
    const now = run(m, 0, FAST, 60 * 60 * 5);
    expect(m.quality).toBe('full');
    run(m, now, SLOW, MIN_SAMPLES * 2);
    expect(m.quality).toBe('lite');
  });

  it('표본이 모이기 전·짧은 끊김 몇 번으로는 바꾸지 않는다', () => {
    const m = createQualityMonitor();
    run(m, 0, SLOW, MIN_SAMPLES - 1);
    expect(m.quality).toBe('full');
    const m2 = createQualityMonitor();
    let now = run(m2, 0, FAST, 600);
    now = run(m2, now, 50, 3);
    run(m2, now, FAST, 60);
    expect(m2.quality).toBe('full');
  });

  it('60Hz 중 끊김 한 번(120·199ms)·50ms 다섯 번은 full 유지 — GC·네트워크 처리로 발광이 꺼졌다 켜지지 않는다 (리뷰 M1)', () => {
    for (const hitches of [[120], [199], [50, 50, 50, 50, 50], [70, 70]]) {
      const m = createQualityMonitor();
      let now = run(m, 0, FAST, 600);
      for (const gap of hitches) now = run(m, now, gap, 1);
      // lite로 떨어졌다면 유지 시간(10초) 동안 그대로이므로 1초 뒤에 본다
      run(m, now, FAST, 60);
      expect(m.quality).toBe('full');
      expect(m.changedAt).toBe(0);
    }
  });

  it('첫 표본이 길어도(스프라이트 굽기·준비) 평균을 정하지 않는다 (리뷰 M1)', () => {
    const m = createQualityMonitor();
    let now = run(m, 0, 150, 1);
    now = run(m, now, 40, 5);
    run(m, now, FAST, 60);
    expect(m.quality).toBe('full');
    expect(m.changedAt).toBe(0);
  });

  it('NaN 간격은 버린다 — 평균이 망가지지 않는다', () => {
    const m = createQualityMonitor();
    sampleDraw(m, NaN, 1);
    expect(m.average).toBeCloseTo(FAST);
    expect(m.samples).toBe(0);
  });

  it('멈춘 화면의 긴 간격(일시정지·탭 전환)과 첫 그리기(간격 0)는 버린다', () => {
    const m = createQualityMonitor();
    run(m, 0, 5000, 200);
    sampleDraw(m, 0, 1);
    expect(m.samples).toBe(0);
    expect(m.quality).toBe('full');
  });

  it('빨라져도 최소 유지 시간 전에는 full로 돌아가지 않고, 지나면 돌아간다', () => {
    const m = createQualityMonitor();
    // 평균이 처음부터 SLOW라 MIN_SAMPLES번째에 들어간다 — 그 순간부터 유지 시간을 센다
    let now = run(m, 0, SLOW, MIN_SAMPLES);
    expect(m.quality).toBe('lite');
    const enteredAt = m.changedAt;
    expect(enteredAt).toBe(now);
    now = run(m, now, FAST, Math.floor((LITE_HOLD_MS - 1000) / FAST));
    expect(m.quality).toBe('lite');
    expect(m.average).toBeLessThan(FULL_EXIT_MS);
    now = run(m, now, FAST, Math.ceil(2000 / FAST));
    expect(m.quality).toBe('full');
    expect(m.changedAt - enteredAt).toBeGreaterThanOrEqual(LITE_HOLD_MS);
  });

  it('들어가는 기준과 나오는 기준 사이(히스테리시스)에서는 지금 품질을 유지한다', () => {
    const between = (LITE_ENTER_MS + FULL_EXIT_MS) / 2;
    const full = createQualityMonitor();
    run(full, 0, between, 60 * 60 * 2);
    expect(full.quality).toBe('full');
    const lite = createQualityMonitor();
    const now = run(lite, 0, SLOW, MIN_SAMPLES * 2);
    run(lite, now, between, 60 * 60 * 2);
    expect(lite.quality).toBe('lite');
  });

  it('lite면 빨라지고 full이면 느려지는 기기 — 오가더라도 유지 시간이 두 배씩 늘어 깜빡이지 않는다', () => {
    const m = createQualityMonitor();
    const switches: number[] = [];
    let now = 0;
    let quality = m.quality;
    // 30분 — 기기의 실제 간격은 지금 품질로 정해진다
    while (now < 30 * 60_000) {
      const gap = m.quality === 'full' ? SLOW : FAST;
      now += gap;
      if (sampleDraw(m, gap, now) !== quality) {
        quality = m.quality;
        switches.push(now);
      }
    }
    // 10초 → 20 → 40 → 80 → 160 → 300초(상한)… 30분 동안 lite 진입이 열 번을 넘지 않는다
    expect(switches.length).toBeLessThanOrEqual(20);
    expect(m.liteHoldMs).toBe(MAX_LITE_HOLD_MS);
    const liteStays = switches.filter((_, i) => i % 2 === 0).map((at, i) => (switches[i * 2 + 1] ?? now) - at);
    // 상한에 닿은 뒤에는 같은 길이 — 그리기 한 번(약 17ms) 차이는 허용
    for (let i = 1; i < liteStays.length - 1; i++) expect(liteStays[i]).toBeGreaterThanOrEqual(liteStays[i - 1] - FAST * 2);
    expect(liteStays[0]).toBeGreaterThanOrEqual(LITE_HOLD_MS);
  });

  it('full로 오래 머문 뒤 다시 느려지면 유지 시간은 처음 값부터', () => {
    const m = createQualityMonitor();
    let now = run(m, 0, SLOW, MIN_SAMPLES * 2);
    now = run(m, now, FAST, Math.ceil((LITE_HOLD_MS + 2000) / FAST));
    expect(m.quality).toBe('full');
    now = run(m, now, SLOW, MIN_SAMPLES * 2);
    expect(m.liteHoldMs).toBe(LITE_HOLD_MS * 2);
    now = run(m, now, FAST, Math.ceil((LITE_HOLD_MS * 2 + 2000) / FAST));
    expect(m.quality).toBe('full');
    now = run(m, now, FAST, Math.ceil(60_000 / FAST));
    run(m, now, SLOW, MIN_SAMPLES * 2);
    expect(m.quality).toBe('lite');
    expect(m.liteHoldMs).toBe(LITE_HOLD_MS);
  });
});
