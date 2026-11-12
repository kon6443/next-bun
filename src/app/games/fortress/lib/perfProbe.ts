/**
 * 프로토타입 실측 탐침 (F1 PoC) — 탄 연출 중 프레임 간격·그리기 시간, AI 계산 시간을 모은다
 * `window.__fortressPerf`로 읽는다(Playwright·원격 디버깅). 화면 표시는 ?perf=1 일 때 PerfOverlay
 */

export type PerfSnapshot = {
  /** 연출(play) 중 프레임 수 */
  frames: number;
  /** 프레임 간격 평균·p95·최대(ms) */
  frameAvg: number;
  frameP95: number;
  frameMax: number;
  /** drawScene 시간 평균·최대(ms) */
  drawAvg: number;
  drawMax: number;
  /** AI 레벨별 chooseTurn 시간(ms) 목록 */
  think: Record<string, number[]>;
};

const MAX_SAMPLES = 2000;
let gaps: number[] = [];
let draws: number[] = [];
const think: Record<string, number[]> = {};

const round = (x: number) => Math.round(x * 100) / 100;

/** 새 연출 구간 시작 — 프레임 표본은 경기 전체로 쌓고(턴마다 지우지 않음) 오래된 것만 버린다 */
export function trimPerf(): void {
  if (gaps.length > MAX_SAMPLES) {
    gaps = gaps.slice(-MAX_SAMPLES);
    draws = draws.slice(-MAX_SAMPLES);
  }
  publish();
}

export function recordFrame(gapMs: number, drawMs: number): void {
  gaps.push(gapMs);
  draws.push(drawMs);
  if (gaps.length % 30 === 0) publish();
}

export function recordThink(level: number, ms: number): void {
  (think[`level${level}`] ??= []).push(round(ms));
  publish();
}

export function clearPerf(): void {
  gaps = [];
  draws = [];
  for (const k of Object.keys(think)) delete think[k];
  publish();
}

export function snapshot(): PerfSnapshot {
  const sorted = [...gaps].sort((a, b) => a - b);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    frames: gaps.length,
    frameAvg: round(avg(gaps)),
    frameP95: round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
    frameMax: round(sorted[sorted.length - 1] ?? 0),
    drawAvg: round(avg(draws)),
    drawMax: round(Math.max(0, ...draws)),
    think: { ...think },
  };
}

function publish(): void {
  if (typeof window === "undefined") return;
  (window as unknown as { __fortressPerf?: PerfSnapshot & { clear: () => void } }).__fortressPerf = { ...snapshot(), clear: clearPerf };
}
