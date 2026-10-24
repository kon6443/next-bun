/** 초당 프레임 기본값 — 테트리스 엔진(60Hz). 다른 틱레이트 게임은 fps를 넘긴다 */
const DEFAULT_FPS = 60;

function formatMinutesSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 밀리초 → "m:ss" (랭킹 durationMs를 틱레이트와 무관하게 그대로 표시) */
export function formatDurationMs(ms: number): string {
  return formatMinutesSeconds(Math.floor(ms / 1000));
}

/** 프레임 수 → "m:ss" */
export function formatFrames(frames: number, fps: number = DEFAULT_FPS): string {
  return formatMinutesSeconds(Math.floor(frames / fps));
}

/** 프레임 → 밀리초 (설정 화면 표시) */
export function framesToMs(frames: number, fps: number = DEFAULT_FPS): number {
  return Math.round((frames * 1000) / fps);
}

export function formatScore(score: number): string {
  return score.toLocaleString('ko-KR');
}

/** 조회수 "조회 1,234" — 조회수 배포 전 응답(필드 없음)은 0 */
export function formatViewCount(viewCount: number | undefined): string {
  return `조회 ${(viewCount ?? 0).toLocaleString('ko-KR')}`;
}

/** 시청 시간 "시청 45초" · "시청 12분" · "시청 3시간 5분" (분 아래는 버린다) */
export function formatWatchTime(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  if (totalSeconds < 60) return `시청 ${totalSeconds}초`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `시청 ${totalMinutes}분`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `시청 ${hours}시간` : `시청 ${hours}시간 ${minutes}분`;
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
