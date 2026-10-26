import { ARR_MAX, ARR_MIN, DAS_MAX, DAS_MIN, DEFAULT_ARR, DEFAULT_DAS } from '../engine';
import {
  type PendingSubmission as GamePendingSubmission,
  createGameStorage,
} from '@/app/games/_shared/lib/storage';
import { createLocalSettingsStore } from '@/app/games/_shared/lib/settingsStore';

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

/** 저장값(깨졌을 수 있음) → 설정 — 범위 밖은 끝값으로, 형식이 틀리면 기본값 */
export function normalizeTetrisSettings(raw: unknown): TetrisSettings {
  const saved = raw !== null && typeof raw === 'object' ? (raw as Partial<TetrisSettings>) : {};
  return {
    das: clampInt(saved.das, DAS_MIN, DAS_MAX, DEFAULT_DAS),
    arr: clampInt(saved.arr, ARR_MIN, ARR_MAX, DEFAULT_ARR),
    vibration: typeof saved.vibration === 'boolean' ? saved.vibration : DEFAULT_SETTINGS.vibration,
  };
}

/**
 * 조작 설정 구독 스토어(D-001) — 홈·플레이·공통 설정 시트가 같은 값을 본다(같은 탭·다른 탭 모두 바로 반영)
 * DAS·ARR은 판을 시작할 때 엔진·리플레이 헤더에 들어간다 — 판 도중 바꾸면 다음 판부터(진행 중 판은 그대로)
 */
export const tetrisSettingsStore = createLocalSettingsStore<TetrisSettings>({
  key: SETTINGS_KEY,
  defaults: DEFAULT_SETTINGS,
  normalize: normalizeTetrisSettings,
});

export function loadSettings(): TetrisSettings {
  return tetrisSettingsStore.load();
}

export function saveSettings(settings: Partial<TetrisSettings>): TetrisSettings {
  return tetrisSettingsStore.save(settings);
}
