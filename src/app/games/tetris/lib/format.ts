import { FRAMES_PER_SECOND } from '../engine';

/** 프레임 수 → "m:ss" */
export function formatFrames(frames: number): string {
  const totalSeconds = Math.floor(frames / FRAMES_PER_SECOND);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 프레임 → 밀리초 (설정 화면 표시) */
export function framesToMs(frames: number): number {
  return Math.round((frames * 1000) / FRAMES_PER_SECOND);
}

export function formatScore(score: number): string {
  return score.toLocaleString('ko-KR');
}

/**
 * 게임 오버 직후 예상 순위 — 서버 순위 규칙(점수 내림차순, 같은 점수면 기존 기록이 위 = 내 새 기록이 아래)과 같게
 * 목록(상위 limit개) 밖이면 null
 */
export function estimateRank(scores: readonly number[], myScore: number, listIsComplete: boolean): number | null {
  let above = 0;
  for (const score of scores) if (score >= myScore) above++;
  if (above >= scores.length && !listIsComplete) return null;
  return above + 1;
}
