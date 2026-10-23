import type { GameType, SubmitScoreRequest } from '@/types/game';

/**
 * 게임 개인 저장소 공통 — 모든 읽기·쓰기는 try/catch (사파리 비공개 모드 등에서 저장소가 막혀도 게임은 동작)
 * 키는 "{gameType}:{이름}" — 테트리스 키(tetris:bestScore 등)는 공용화 전과 같다
 */

export type StorageKind = 'local' | 'session';

function storage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(kind: StorageKind, key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 저장했으면 true — 용량 초과·차단이면 false (보존만 포기한다) */
export function writeStorage(kind: StorageKind, key: string, value: string): boolean {
  try {
    const target = storage(kind);
    if (!target) return false;
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(kind: StorageKind, key: string): void {
  try {
    storage(kind)?.removeItem(key);
  } catch {
    // 무시
  }
}

export function readStorageJson<T>(kind: StorageKind, key: string): T | null {
  const raw = readStorage(kind, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const MY_SCORES_LIMIT = 50;

export type PendingSubmission<G extends GameType = 'tetris'> = SubmitScoreRequest<G> & {
  /** 엔진이 계산한 점수 (표시용) */
  score: number;
  savedAt: number;
};

export type GameStorageOptions = {
  /** 등록 못 한 기록(재시도용)을 둘 곳 */
  pendingKind: StorageKind;
  /** 보관할 최대 건수 — 넘치면 가장 오래된 것부터 버린다 */
  pendingLimit: number;
};

/**
 * 게임별 저장소 — localStorage: 최고점·마지막 이름·내가 등록한 기록 / options.pendingKind: 등록 못 한 기록
 * 게임 고유 값(설정 등)은 게임 쪽에서 read/writeStorage로 `${gameType}:...` 키를 쓴다
 */
export function createGameStorage<G extends GameType>(gameType: G, options: GameStorageOptions) {
  const KEY = {
    best: `${gameType}:bestScore`,
    name: `${gameType}:lastName`,
    myScores: `${gameType}:myScoreIds`,
    pending: `${gameType}:pendingSubmission`,
  } as const;
  const { pendingKind, pendingLimit } = options;

  // ==================== 최고점·이름 ====================

  function loadBestScore(): number {
    const value = Number(readStorage('local', KEY.best));
    return Number.isInteger(value) && value > 0 ? value : 0;
  }

  /** 더 높으면 저장하고 true */
  function recordBestScore(score: number): boolean {
    if (score <= loadBestScore()) return false;
    writeStorage('local', KEY.best, String(score));
    return true;
  }

  function loadLastName(): string {
    return readStorage('local', KEY.name) ?? '';
  }

  function saveLastName(name: string): void {
    writeStorage('local', KEY.name, name);
  }

  // ==================== 내가 등록한 기록 ====================

  function loadMyScoreIds(): number[] {
    const ids = readStorageJson<unknown[]>('local', KEY.myScores);
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : [];
  }

  function addMyScoreId(scoreId: number): void {
    const ids = [scoreId, ...loadMyScoreIds().filter((id) => id !== scoreId)].slice(0, MY_SCORES_LIMIT);
    writeStorage('local', KEY.myScores, JSON.stringify(ids));
  }

  // ==================== 등록 못 한 기록 ====================
  // 판마다 세션이 달라 sessionId로 구분한다 — 다른 판의 등록 결과가 이 판의 보관 기록을 지우거나 덮어쓰지 않게

  function isPending(value: unknown): value is PendingSubmission<G> {
    const p = value as PendingSubmission<G> | null;
    return !!p && typeof p.sessionId === 'string' && typeof p.playerName === 'string' && !!p.replay;
  }

  /** 보관 기록 — 오래된 것부터 */
  function loadPendingSubmissions(): PendingSubmission<G>[] {
    const list = readStorageJson<unknown[]>(pendingKind, KEY.pending);
    return Array.isArray(list) ? list.filter(isPending) : [];
  }

  /**
   * 용량을 넘으면(긴 판의 입력 기록은 수백 KB) 가장 오래된 기록부터 빼고 다시 저장 — 최신 기록을 우선 지킨다
   * 최신 1건도 못 쓰면 false (저장소 차단·용량 초과) — 기존 보관 값은 그대로 둔다(setItem 실패는 기존 값을 바꾸지 않는다)
   */
  function savePendingList(list: PendingSubmission<G>[]): boolean {
    if (list.length === 0) {
      removeStorage(pendingKind, KEY.pending);
      return true;
    }
    for (let start = 0; start < list.length; start++) {
      if (writeStorage(pendingKind, KEY.pending, JSON.stringify(list.slice(start)))) return true;
    }
    return false;
  }

  /** 같은 세션이면 갱신, 아니면 추가 (넘치면 가장 오래된 것부터 버린다) — 이 기록을 보관하지 못했으면 false (games-polish FE-46) */
  function savePendingSubmission(pending: PendingSubmission<G>): boolean {
    const others = loadPendingSubmissions().filter((p) => p.sessionId !== pending.sessionId);
    return savePendingList([...others, pending].slice(-pendingLimit));
  }

  function removePendingSubmission(sessionId: string): void {
    savePendingList(loadPendingSubmissions().filter((p) => p.sessionId !== sessionId));
  }

  return {
    loadBestScore,
    recordBestScore,
    loadLastName,
    saveLastName,
    loadMyScoreIds,
    addMyScoreId,
    loadPendingSubmissions,
    savePendingSubmission,
    removePendingSubmission,
  };
}

export type GameStorage<G extends GameType> = ReturnType<typeof createGameStorage<G>>;
