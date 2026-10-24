import { WATCH_REPORT_MAX_MS, recordReplayView } from '@/services/gameService';
import type { GameType } from '@/types/game';
import { readStorage, writeStorage } from './storage';

/**
 * 리플레이 조회수·시청 시간 (백엔드 replay-views 계약)
 * - 조회: 브라우저당 하루(KST) 1회만 POST — 간단한 어뷰징 거르기. 서버가 다시 거를 수 있다(counted=false)
 * - 시청: 재생이 실제로 진행된 벽시계 ms를 쌓아 두었다가 나눠 보고한다(보고 주기·시점은 useReplayWatchReport)
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const VIEW_KEY_PREFIX = 'view:';

/** KST 날짜 "YYYY-MM-DD" — 기기 시간대와 무관하게 */
export function kstDate(now: number): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function viewStorageKey(gameType: GameType, scoreId: number, now: number): string {
  return `${VIEW_KEY_PREFIX}${gameType}:${scoreId}:${kstDate(now)}`;
}

/** 오늘이 아닌 조회 키를 지운다 — 날마다 키가 쌓이지 않게 */
function pruneOldViewKeys(today: string): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(VIEW_KEY_PREFIX) && !key.endsWith(`:${today}`)) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
    // 저장소가 막혀도 조회 기록은 그대로
  }
}

/** 같은 기록의 진행 중인 요청 — StrictMode 이중 effect·재마운트가 키를 저장하기 전에 두 번 보내지 않게 */
const inflight = new Map<string, Promise<number | null>>();

/**
 * 재생 화면 진입 때 조회 기록 — 서버가 돌려준 조회수(오늘 이미 보냈으면 요청 없이 그때 받은 값), 모르면 null
 * 성공하면 받은 조회수를 키에 저장한다 — 같은 날 다시 들어와도 표시가 진입 전 값(재생 응답 캐시)으로 줄지 않게
 * 실패(404 포함)는 조용히 null — 키를 저장하지 않아 다음 진입에 다시 보낸다
 */
export function recordViewOncePerDay(gameType: GameType, scoreId: number, now: number = Date.now()): Promise<number | null> {
  const key = viewStorageKey(gameType, scoreId, now);
  const stored = readStorage('local', key);
  if (stored !== null) {
    const count = Number(stored);
    return Promise.resolve(Number.isSafeInteger(count) && count >= 0 ? count : null);
  }
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = recordReplayView(gameType, scoreId)
    .then(({ data }) => {
      pruneOldViewKeys(kstDate(now));
      // 응답에 조회수가 없으면(계약 밖) 키를 남기지 않는다 — 다음 진입에 다시 묻는다
      if (!Number.isSafeInteger(data.viewCount)) return null;
      writeStorage('local', key, String(data.viewCount));
      return data.viewCount;
    })
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** 테스트용 */
export function clearViewRequests(): void {
  inflight.clear();
}

export type WatchMeter = {
  /** 재생이 진행된 벽시계 ms를 더한다 */
  add: (ms: number) => void;
  /** 보낼 몫을 꺼낸다 — 정수 ms만, 1회 상한씩 나눠서. 꺼낸 만큼 먼저 차감한다(다시 보내도 겹치지 않게) */
  take: () => number[];
};

export function createWatchMeter(): WatchMeter {
  let pending = 0;
  return {
    add(ms) {
      if (Number.isFinite(ms) && ms > 0) pending += ms;
    },
    take() {
      const whole = Math.floor(pending);
      if (whole < 1) return [];
      pending -= whole;
      const chunks: number[] = [];
      for (let rest = whole; rest > 0; rest -= WATCH_REPORT_MAX_MS) chunks.push(Math.min(rest, WATCH_REPORT_MAX_MS));
      return chunks;
    },
  };
}
