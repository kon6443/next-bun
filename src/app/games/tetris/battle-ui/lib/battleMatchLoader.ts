import { ApiError } from '@/types/api';
import { type BattleMatch, type BattleReplayDetail, getBattleMatch, getBattleReplay } from '@/services/tetrisBattleService';

/**
 * 대전 경기·리플레이 조회 — 같은 요청은 진행 중인 것을 함께 쓴다 (_shared replayLoader와 같은 이유)
 * StrictMode·Fast Refresh 재마운트로 같은 조회를 연달아 부르면 조회 스로틀(IP당 초당 3)에 걸린다
 * - 경기: 저장 대기 중 다시 물어야 하므로 진행 중인 요청만 함께 쓴다(끝나면 버린다)
 * - 리플레이: 저장된 뒤 바뀌지 않으므로 받아 둔 것을 재사용한다(입력 기록이 커서 최근 몇 개만)
 *   일시 실패 재시도는 화면을 떠나도 끝까지 간다(최대 2회) — 결과가 캐시에 남아 다시 들어오면 그대로 쓴다
 * 네트워크 오류는 FetchService가 ApiError가 아닌 NetworkError로 던지므로 재시도 대상에 든다
 */
const REPLAY_CACHE_LIMIT = 8;
/** 일시 실패(429·5xx·네트워크)만 간격을 두고 다시 */
const REPLAY_RETRIES = 2;
const REPLAY_RETRY_MS = 1500;

const inflightMatches = new Map<string, Promise<BattleMatch>>();
const replays = new Map<string, Promise<BattleReplayDetail>>();

export function loadBattleMatch(matchId: string): Promise<BattleMatch> {
  const pending = inflightMatches.get(matchId);
  if (pending) return pending;
  const request = getBattleMatch(matchId).then(({ data }) => data);
  inflightMatches.set(matchId, request);
  const clear = () => {
    if (inflightMatches.get(matchId) === request) inflightMatches.delete(matchId);
  };
  request.then(clear, clear);
  return request;
}

export function isRetryableLoadError(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 429 || err.status >= 500;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function loadBattleReplay(
  matchId: string,
  playerId: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<BattleReplayDetail> {
  const key = `${matchId}:${playerId}`;
  const cached = replays.get(key);
  if (cached) return cached;
  const request = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return (await getBattleReplay(matchId, playerId)).data;
      } catch (err) {
        if (!isRetryableLoadError(err) || attempt >= REPLAY_RETRIES) throw err;
        await sleep(REPLAY_RETRY_MS * (attempt + 1));
      }
    }
  })();
  replays.set(key, request);
  // 실패는 캐시하지 않는다 — 다시 들어오면 새로 부른다
  request.catch(() => {
    if (replays.get(key) === request) replays.delete(key);
  });
  while (replays.size > REPLAY_CACHE_LIMIT) replays.delete(replays.keys().next().value as string);
  return request;
}

/** 테스트용 */
export function clearBattleMatchCache(): void {
  inflightMatches.clear();
  replays.clear();
}
