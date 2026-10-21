import { SITE_CONFIG } from '@/app/config/siteConfig';
import type { TetrisScoreDetail } from '@/types/game';
import { formatScore } from './format';

/**
 * 리플레이 공유 — URL·문구·클립보드·Web Share (DESIGN §2)
 */

export type ShareTarget = {
  scoreId: number;
  playerName: string;
  score: number;
  detail: Pick<TetrisScoreDetail, 'lines' | 'level'>;
};

/** 경로의 scoreId — 양의 정수가 아니면 null (백엔드에 묻지 않는다) */
export function parseScoreId(raw: string): number | null {
  return /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}

export function replayPath(scoreId: number): string {
  return `/games/tetris/replays/${scoreId}`;
}

/** 공유 URL — 절대 경로, 쿼리 없음 */
export function replayUrl(scoreId: number): string {
  return `${SITE_CONFIG.url}${replayPath(scoreId)}`;
}

/** 기록 미리보기 이미지 경로 — route group 밖의 고정 route handler (replays/[scoreId]/og/route.tsx) */
export function replayImagePath(scoreId: number | string): string {
  return `/games/tetris/replays/${scoreId}/og`;
}

/** 기록 미리보기 이미지 절대 URL — 카카오 피드 카드 이미지 */
export function replayImageUrl(scoreId: number): string {
  return `${SITE_CONFIG.url}${replayImagePath(scoreId)}`;
}

/** "{이름}님의 테트리스 {점수}점" */
export function replayHeadline(target: Pick<ShareTarget, 'playerName' | 'score'>): string {
  return `${target.playerName}님의 테트리스 ${formatScore(target.score)}점`;
}

/** "{이름}님의 테트리스 {점수}점 ({줄}줄 · 레벨 {L}) — 리플레이 보기" */
export function buildShareText(target: ShareTarget): string {
  return `${replayHeadline(target)} (${target.detail.lines}줄 · 레벨 ${target.detail.level}) — 리플레이 보기`;
}

/** 비보안 컨텍스트(http)·구형 브라우저에는 clipboard API가 없다 */
export async function copyText(text: string): Promise<'copied' | 'unsupported' | 'failed'> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return 'unsupported';
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** 사용자가 공유 시트를 닫으면(AbortError) 실패가 아니라 취소다 — 에러 토스트를 띄우지 않는다 */
export async function webShare(data: ShareData): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
