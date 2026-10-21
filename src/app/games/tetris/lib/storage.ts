import { ARR_MAX, ARR_MIN, DAS_MAX, DAS_MIN, DEFAULT_ARR, DEFAULT_DAS } from '../engine';
import {
  type PendingSubmission as GamePendingSubmission,
  createGameStorage,
  readStorageJson,
  writeStorage,
} from '@/app/games/_shared/lib/storage';

/**
 * 테트리스 개인 저장소 — 공통 저장소(키 tetris:*) + 테트리스 설정
 * localStorage: 최고점·마지막 이름·설정·내가 등록한 기록 / sessionStorage: 등록 못 한 기록(재시도용, 최근 5건)
 */

const SETTINGS_KEY = 'tetris:settings';

export const tetrisStorage = createGameStorage('tetris', { pendingKind: 'session', pendingLimit: 5 });

export const {
  loadBestScore,
  recordBestScore,
  loadLastName,
  saveLastName,
  loadMyScoreIds,
  addMyScoreId,
  loadPendingSubmissions,
  savePendingSubmission,
  removePendingSubmission,
} = tetrisStorage;

export type PendingSubmission = GamePendingSubmission<'tetris'>;

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
  const saved = readStorageJson<Partial<TetrisSettings>>('local', SETTINGS_KEY);
  if (!saved) return { ...DEFAULT_SETTINGS };
  return {
    das: clampInt(saved.das, DAS_MIN, DAS_MAX, DEFAULT_DAS),
    arr: clampInt(saved.arr, ARR_MIN, ARR_MAX, DEFAULT_ARR),
    vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULT_SETTINGS.vibration,
  };
}

export function saveSettings(settings: TetrisSettings): void {
  writeStorage('local', SETTINGS_KEY, JSON.stringify(settings));
}
