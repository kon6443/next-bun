import { getGameReplay } from '@/services/gameService';
import type { ReplayData } from '@/types/game';

/**
 * 리플레이 조회 — 같은 기록은 진행 중이거나 받아 둔 요청을 함께 쓴다
 * StrictMode·Fast Refresh·화면 전환 중 재마운트로 같은 기록을 연달아 부르면 리플레이 스로틀(초당 2)에 걸리기 때문
 * 기록은 바뀌지 않으므로 받아 둔 것을 재사용해도 된다 (입력 기록이 수백 KB라 최근 몇 개만 둔다)
 */
const CACHE_LIMIT = 3;
const cache = new Map<number, Promise<ReplayData>>();

export function loadReplay(scoreId: number): Promise<ReplayData> {
  const cached = cache.get(scoreId);
  if (cached) return cached;
  const request = getGameReplay('tetris', scoreId).then(({ data }) => data);
  cache.set(scoreId, request);
  // 실패는 캐시하지 않는다 — 다시 들어오면 새로 부른다
  request.catch(() => {
    if (cache.get(scoreId) === request) cache.delete(scoreId);
  });
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as number);
  return request;
}

/** 테스트용 */
export function clearReplayCache(): void {
  cache.clear();
}
