/**
 * 프레임 간격으로 보는 느린 기기 판정(D-025 B) — 그리기(JS) 시간은 짧은데 래스터·합성이 느려 프레임이 밀리는 기기를 잡는다
 * 30Hz로 고르게 묶인 기기(저전력 모드)는 간격이 일정해서 느린 기기로 보지 않는다 — 느린 기기는 간격이 들쭉날쭉하거나, 고르더라도 25fps 아래다
 * 탭 숨김·일시정지 같은 긴 공백(LONG_GAP_MS 초과)은 세지 않는다
 */

export const JANK_WINDOW = 120;
/** 이 간격(ms)을 넘으면 늦은 프레임 — 40fps 아래 */
export const JANK_FRAME_MS = 25;
/** 창 안 늦은 프레임 비율이 이 이상이면 */
export const JANK_RATIO = 0.5;
/** 간격의 변동계수(표준편차/평균)가 이보다 크면 들쭉날쭉 — 30Hz 고정은 거의 0 */
export const JANK_MIN_CV = 0.15;
/** 평균 간격이 이보다 길면(25fps 아래) 고르더라도 느린 기기 — 30Hz 고정(33ms)보다 확실히 느림 */
export const JANK_MEAN_MS = 40;
/** 변동계수에서 빼는 가장 긴 간격 수(창의 5%) */
export const JANK_OUTLIERS = 6;
const LONG_GAP_MS = 250;

export type JankJudge = { push: (intervalMs: number) => boolean };

export function createJankJudge(): JankJudge {
  const buf = new Float64Array(JANK_WINDOW);
  let n = 0;
  let at = 0;
  return {
    push(intervalMs) {
      if (!(intervalMs > 0) || intervalMs > LONG_GAP_MS) return false;
      buf[at] = intervalMs;
      at = (at + 1) % JANK_WINDOW;
      if (n < JANK_WINDOW) n++;
      if (n < JANK_WINDOW) return false;
      let sum = 0;
      let late = 0;
      for (let i = 0; i < JANK_WINDOW; i++) {
        sum += buf[i];
        if (buf[i] > JANK_FRAME_MS) late++;
      }
      if (late / JANK_WINDOW < JANK_RATIO) return false;
      const mean = sum / JANK_WINDOW;
      if (mean > JANK_MEAN_MS) return true;
      // 들쭉날쭉함은 가장 긴 간격 몇 개(JANK_OUTLIERS)를 빼고 본다 — 30Hz 고정 기기의 가끔 밀린 프레임(GC 등)으로 판정되지 않게
      const sorted = Array.from(buf).sort((a, b) => a - b).slice(0, JANK_WINDOW - JANK_OUTLIERS);
      const m = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      let v = 0;
      for (const x of sorted) v += (x - m) ** 2;
      return Math.sqrt(v / sorted.length) / m > JANK_MIN_CV;
    },
  };
}
