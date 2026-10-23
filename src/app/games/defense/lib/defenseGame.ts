import type { GameUiConfig } from '@/app/games/_shared/lib/gameConfig';
import { formatDurationMs } from '@/app/games/_shared/lib/format';
import { createGameStorage, readStorageJson, writeStorage } from '@/app/games/_shared/lib/storage';

/**
 * 디펜스 화면 사양 (defense DESIGN §F7·§F10 저장) — 공용 등록 패널·랭킹에 넘긴다
 * 저장: defense:lastName · defense:myScoreIds · defense:pendingSubmission(localStorage, 최대 3 — D-020) · defense:best(보드별)
 * 엔진을 import하지 않는다(허브·랭킹 번들)
 */

/** 서버 기록 재생기(F3) — 준비되기 전에는 등록 패널·랭킹에서 다시보기를 비활성 */
export const REPLAY_PLAYER_READY = false;

export const defenseStorage = createGameStorage('defense', { pendingKind: 'local', pendingLimit: 3 });

export const DEFENSE_GAME: GameUiConfig<'defense'> = {
  gameType: 'defense',
  name: '타워 디펜스',
  homePath: '/games/defense',
  playPath: '/games/defense/play/endless',
  rankingsPath: '/games/defense/rankings',
  // 재생기는 F3 — 그 전에는 등록 패널·랭킹에서 다시보기를 숨긴다
  replayPath: (scoreId) => `/games/defense/replays/${scoreId}`,
  rankingDetail: (item) => defenseStatLine(item.detail, item.durationMs),
  storage: defenseStorage,
};

/** 랭킹 행 요약 — "웨이브 24 · 처치 812 · 31:20" (detail 키: 백엔드 defense-verify) */
export function defenseStatLine(detail: Record<string, number>, durationMs: number): string {
  const parts = [`웨이브 ${detail.wave ?? 0}`];
  if (Number.isFinite(detail.kills)) parts.push(`처치 ${detail.kills}`);
  parts.push(formatDurationMs(durationMs));
  return parts.join(' · ');
}

// ==================== 보드별 최고 점수 ====================

const BEST_KEY = 'defense:best';
const BEST_VERSION = 1;
/** 주간 보드는 최근 8주만 남긴다 (§F10 저장) */
const WEEKLY_KEEP = 8;

type BestStore = { v: number; boards: Record<string, number> };

export function loadBests(): Record<string, number> {
  const raw = readStorageJson<BestStore>('local', BEST_KEY);
  if (!raw || raw.v !== BEST_VERSION || typeof raw.boards !== 'object' || raw.boards === null) return {};
  const boards: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.boards)) if (Number.isFinite(value)) boards[key] = value;
  return boards;
}

export function loadBest(boardKey: string): number {
  return loadBests()[boardKey] ?? 0;
}

/** 그 보드 최고 점수를 갱신 — 새 최고면 true(저장 실패해도 판정은 한다) */
export function recordBest(boardKey: string, score: number): boolean {
  const boards = loadBests();
  if (score <= (boards[boardKey] ?? 0)) return false;
  boards[boardKey] = score;
  // 주간은 키(weekly-YYYY-wNN)가 시간순 정렬 — 오래된 주부터 버린다
  const weekly = Object.keys(boards)
    .filter((key) => key.startsWith('weekly-'))
    .sort();
  for (const key of weekly.slice(0, Math.max(0, weekly.length - WEEKLY_KEEP))) delete boards[key];
  writeStorage('local', BEST_KEY, JSON.stringify({ v: BEST_VERSION, boards }));
  return true;
}
