import { ARR_MAX, ARR_MIN, DAS_MAX, DAS_MIN, DEFAULT_ARR, DEFAULT_DAS } from '../engine';
import type { SubmitScoreRequest } from '@/types/game';

/**
 * 테트리스 개인 저장소 — 모든 읽기·쓰기는 try/catch (사파리 비공개 모드 등에서 저장소가 막혀도 게임은 동작)
 * localStorage: 최고점·마지막 이름·설정·내가 등록한 기록 / sessionStorage: 등록 못 한 기록(재시도용)
 */

const KEY = {
  best: 'tetris:bestScore',
  name: 'tetris:lastName',
  settings: 'tetris:settings',
  myScores: 'tetris:myScoreIds',
  pending: 'tetris:pendingSubmission',
} as const;

const MY_SCORES_LIMIT = 50;

type StorageKind = 'local' | 'session';

function storage(kind: StorageKind): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(kind: StorageKind, key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 저장했으면 true — 용량 초과·차단이면 false (보존만 포기한다) */
function write(kind: StorageKind, key: string, value: string): boolean {
  try {
    const target = storage(kind);
    if (!target) return false;
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function remove(kind: StorageKind, key: string): void {
  try {
    storage(kind)?.removeItem(key);
  } catch {
    // 무시
  }
}

function readJson<T>(kind: StorageKind, key: string): T | null {
  const raw = read(kind, key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const clampInt = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : fallback;

// ==================== 설정 ====================

export type TetrisSettings = {
  /** 프레임 */
  das: number;
  /** 프레임 */
  arr: number;
  vibration: boolean;
};

export const DEFAULT_SETTINGS: TetrisSettings = { das: DEFAULT_DAS, arr: DEFAULT_ARR, vibration: true };

export function loadSettings(): TetrisSettings {
  const saved = readJson<Partial<TetrisSettings>>('local', KEY.settings);
  if (!saved) return { ...DEFAULT_SETTINGS };
  return {
    das: clampInt(saved.das, DAS_MIN, DAS_MAX, DEFAULT_DAS),
    arr: clampInt(saved.arr, ARR_MIN, ARR_MAX, DEFAULT_ARR),
    vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULT_SETTINGS.vibration,
  };
}

export function saveSettings(settings: TetrisSettings): void {
  write('local', KEY.settings, JSON.stringify(settings));
}

// ==================== 최고점·이름 ====================

export function loadBestScore(): number {
  const value = Number(read('local', KEY.best));
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/** 더 높으면 저장하고 true */
export function recordBestScore(score: number): boolean {
  if (score <= loadBestScore()) return false;
  write('local', KEY.best, String(score));
  return true;
}

export function loadLastName(): string {
  return read('local', KEY.name) ?? '';
}

export function saveLastName(name: string): void {
  write('local', KEY.name, name);
}

// ==================== 내가 등록한 기록 ====================

export function loadMyScoreIds(): number[] {
  const ids = readJson<unknown[]>('local', KEY.myScores);
  return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : [];
}

export function addMyScoreId(scoreId: number): void {
  const ids = [scoreId, ...loadMyScoreIds().filter((id) => id !== scoreId)].slice(0, MY_SCORES_LIMIT);
  write('local', KEY.myScores, JSON.stringify(ids));
}

// ==================== 등록 못 한 기록 ====================

export type PendingSubmission = SubmitScoreRequest & {
  /** 엔진이 계산한 점수 (표시용) */
  score: number;
  savedAt: number;
};

/** 판마다 세션이 달라 sessionId로 구분한다 — 다른 판의 등록 결과가 이 판의 보관 기록을 지우거나 덮어쓰지 않게 */
const PENDING_LIMIT = 5;

function isPending(value: unknown): value is PendingSubmission {
  const p = value as PendingSubmission | null;
  return !!p && typeof p.sessionId === 'string' && typeof p.playerName === 'string' && !!p.replay;
}

/** 보관 기록 — 오래된 것부터 */
export function loadPendingSubmissions(): PendingSubmission[] {
  const list = readJson<unknown[]>('session', KEY.pending);
  return Array.isArray(list) ? list.filter(isPending) : [];
}

/** 용량을 넘으면(긴 판의 입력 기록은 수백 KB) 가장 오래된 기록부터 빼고 다시 저장 — 최신 기록을 우선 지킨다 */
function savePendingList(list: PendingSubmission[]): void {
  if (list.length === 0) {
    remove('session', KEY.pending);
    return;
  }
  for (let start = 0; start < list.length; start++) {
    if (write('session', KEY.pending, JSON.stringify(list.slice(start)))) return;
  }
  // 최신 1건도 못 쓰면 기존 보관 값은 그대로 둔다 (setItem 실패는 기존 값을 바꾸지 않는다)
}

/** 같은 세션이면 갱신, 아니면 추가 (넘치면 가장 오래된 것부터 버린다) */
export function savePendingSubmission(pending: PendingSubmission): void {
  const others = loadPendingSubmissions().filter((p) => p.sessionId !== pending.sessionId);
  savePendingList([...others, pending].slice(-PENDING_LIMIT));
}

export function removePendingSubmission(sessionId: string): void {
  savePendingList(loadPendingSubmissions().filter((p) => p.sessionId !== sessionId));
}
