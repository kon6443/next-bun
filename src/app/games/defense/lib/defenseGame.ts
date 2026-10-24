import type { GameUiConfig } from '@/app/games/_shared/lib/gameConfig';
import { formatDurationMs } from '@/app/games/_shared/lib/format';
import { createGameStorage, readStorageJson, writeStorage } from '@/app/games/_shared/lib/storage';

/**
 * 디펜스 화면 사양 (defense DESIGN §F7·§F10 저장) — 공용 등록 패널·랭킹에 넘긴다
 * 저장: defense:lastName · defense:myScoreIds · defense:pendingSubmission(localStorage, 최대 3 — D-020) · defense:best(보드별)
 * 엔진을 import하지 않는다(허브·랭킹 번들)
 */

export const defenseStorage = createGameStorage('defense', { pendingKind: 'local', pendingLimit: 3 });

/** 점수 = 클리어 웨이브 × 10⁶ + 진척‰ × 10³ — 엔진 scoreOf(engine/game.ts)와 같아야 한다(허브·랭킹은 엔진을 불러오지 않는다) */
export const SCORE_PER_WAVE = 1_000_000;
const SCORE_PER_PERMILLE = 1_000;

/** 점수 → 클리어 웨이브·진척(‰) */
/** 가장 많이 샌 적 종류(목숨 기준, 같으면 앞 종류) — 하나도 안 샜으면 -1 */
export function worstLeakedEnemy(leakedLivesByEnemy: readonly (number | undefined)[]): number {
  let worst = -1;
  leakedLivesByEnemy.forEach((lives, kind) => {
    if ((lives ?? 0) > (leakedLivesByEnemy[worst] ?? 0)) worst = kind;
  });
  return worst;
}

export function splitDefenseScore(score: number): { wave: number; progress: number } {
  const safe = Math.max(0, Math.floor(score));
  return { wave: Math.floor(safe / SCORE_PER_WAVE), progress: Math.floor((safe % SCORE_PER_WAVE) / SCORE_PER_PERMILLE) };
}

/** 점수 표기 (사용자 결정) — "웨이브 24 · 진척 52%" (진척 = 다음 웨이브 처치 비율, 내림). 결과·랭킹·공유 카드 공통 */
export function formatDefenseScore(score: number): string {
  const { wave, progress } = splitDefenseScore(score);
  return `웨이브 ${wave} · 진척 ${Math.floor(progress / 10)}%`;
}

export const DEFENSE_GAME: GameUiConfig<'defense'> = {
  gameType: 'defense',
  name: '타워 디펜스',
  homePath: '/games/defense',
  playPath: '/games/defense/play/endless',
  rankingsPath: '/games/defense/rankings',
  replayPath: (scoreId) => `/games/defense/replays/${scoreId}`,
  rankingDetail: (item) => defenseStatLine(item.detail, item.durationMs),
  formatScore: formatDefenseScore,
  storage: defenseStorage,
};

/** 랭킹 행 둘째 줄 — "처치 812 · 31:20" (웨이브는 점수 칸 "웨이브 n · 진척 p%"에 있다. detail 키: 백엔드 defense-verify) */
export function defenseStatLine(detail: Record<string, number>, durationMs: number): string {
  const parts: string[] = [];
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
