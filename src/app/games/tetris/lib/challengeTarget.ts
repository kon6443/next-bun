import { getGameScoreSummary } from '@/services/gameServerService';
import type { ScoreSummary } from '@/types/game';
import { challengeRootId } from './challenge';

/**
 * 서버 전용 — 도전장 링크가 가리키는 원본 기록 요약 (미리보기 메타·OG 카드)
 * 링크 id가 도전장 보드 기록이면 그 원본(root) — 받은 사람 화면이 root에 도전하므로 미리보기도 root로 맞춘다
 * 실패는 null(일반 도전장 미리보기로 폴백)
 */
export async function loadChallengeTarget(scoreId: number): Promise<ScoreSummary | null> {
  const summary = await getGameScoreSummary('tetris', scoreId);
  const root = challengeRootId(summary?.boardKey);
  return root !== null && root !== scoreId ? await getGameScoreSummary('tetris', root) : summary;
}
