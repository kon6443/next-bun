import serverFetchInstance from './serverFetch';
import type { ApiResponse } from '@/types/api';
import type { GameType, ScoreDetailByGame, ScoreSummary } from '@/types/game';
import type { BattleMatch } from './tetrisBattleService';

/**
 * 기록은 바뀌지 않는다 — 미리보기 메타·이미지가 같은 기록을 반복 조회해도 백엔드는 10분에 한 번만
 * Next 데이터 캐시는 200 응답만 저장한다(next 15.5 server/lib/patch-fetch.js `res.status === 200` 조건) —
 * 429(Next 서버 IP 하나로 집계되는 전역 스로틀)·5xx·네트워크 오류는 캐시되지 않아, 폴백 카드가 10분간 고정되지 않는다.
 * 만료 뒤 재검증이 실패해도 이전 200 항목이 남는다. Next를 올리면 이 조건을 다시 확인한다
 */
export const SCORE_SUMMARY_REVALIDATE_SECONDS = 600;
/** 백엔드가 느려도 링크 미리보기(크롤러)가 오래 기다리지 않게 */
const SUMMARY_TIMEOUT_MS = 3000;

/**
 * 서버(Next) 전용 — 기록 요약 조회 (링크 미리보기 메타·OG 이미지)
 *
 * 다른 서비스와 달리 실패를 던지지 않고 null을 돌려준다: 호출부(generateMetadata·opengraph-image)는
 * 없음·숨김(404)·네트워크 실패 모두 일반 테트리스 미리보기로 폴백하기만 하므로 실패 종류를 구분할 필요가 없다
 */
export async function getGameScoreSummary<G extends GameType>(
  gameType: G,
  scoreId: number,
): Promise<ScoreSummary<ScoreDetailByGame[G]> | null> {
  try {
    const response = await serverFetchInstance.backendFetch({
      method: 'GET',
      endpoint: `/api/v1/games/${gameType}/scores/${scoreId}`,
      next: { revalidate: SCORE_SUMMARY_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ApiResponse<ScoreSummary<ScoreDetailByGame[G]>>;
    return body?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * 서버(Next) 전용 — 저장된 대전 경기 요약 (경기 페이지 링크 미리보기 메타·OG 이미지)
 * 기록 요약과 같은 규칙: 실패는 null(일반 미리보기로 폴백), 200만 10분 캐시 — 저장 전 404는 캐시되지 않는다
 */
export async function getBattleMatchSummary(matchId: string): Promise<BattleMatch | null> {
  try {
    const response = await serverFetchInstance.backendFetch({
      method: 'GET',
      endpoint: `/api/v1/tetris-battle/matches/${encodeURIComponent(matchId)}`,
      next: { revalidate: SCORE_SUMMARY_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as ApiResponse<BattleMatch>;
    return body?.data ?? null;
  } catch {
    return null;
  }
}
