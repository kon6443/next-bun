import { formatScore } from '@/app/games/_shared/lib/format';
import { readStorageJson, writeStorage } from '@/app/games/_shared/lib/storage';
import type { GameBoard } from '@/types/game';

/**
 * 오늘의 테트리스 (games-growth B1) — 하루(KST) 동안 모두 같은 seed로 겨루는 데일리 보드
 * 보드 키 daily-YYYY-MM-DD(KST). 리플레이는 그날이 끝나고 2시간 뒤 공개(그 전엔 서버 404)
 * 하루 1판 제한은 없다 — 이 기기의 "오늘 첫 판"을 저장해 두고 공유 문구는 첫 판 기준으로 만든다
 */

export const DAILY_PLAY_PATH = '/games/tetris/play/daily';
const DAILY_KEY = /^daily-(\d{4})-(\d{2})-(\d{2})$/;
/** 그날 끝 → 리플레이 공개까지 */
export const DAILY_REPLAY_DELAY_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isDailyBoardKey(boardKey: string): boolean {
  return DAILY_KEY.test(boardKey);
}

/** "10/24" — 앞자리 0 없이 */
export function dailyDateLabel(boardKey: string): string {
  const match = DAILY_KEY.exec(boardKey);
  return match ? `${Number(match[2])}/${Number(match[3])}` : '';
}

/** /boards의 데일리 보드 — 오늘(current)과 지난 날 */
export function dailyBoards(boards: readonly GameBoard[] | null): GameBoard[] {
  return (boards ?? []).filter((board) => board.mode === 'daily' && isDailyBoardKey(board.boardKey));
}

/** 리플레이 공개 상태 — running: 오늘 진행 중 · soon: 끝났지만 공개 전 · open: 공개. endsAt을 모르면 보드 키의 KST 날짜로 */
export function dailyReplayState(board: Pick<GameBoard, 'boardKey' | 'current' | 'endsAt'>, now: number): 'running' | 'soon' | 'open' {
  if (board.current) return 'running';
  const match = DAILY_KEY.exec(board.boardKey);
  const end = board.endsAt ? Date.parse(board.endsAt) : match ? Date.parse(`${match[1]}-${match[2]}-${match[3]}T00:00:00+09:00`) + DAY_MS : Number.NaN;
  if (!Number.isFinite(end)) return 'open';
  if (now < end) return 'running';
  return now < end + DAILY_REPLAY_DELAY_MS ? 'soon' : 'open';
}

/** 이 기기의 오늘 첫 판 — 하루치만 둔다(다른 날 기록은 덮는다) */
export type DailyFirstRun = {
  boardKey: string;
  score: number;
  lines: number;
  level: number;
  /** 등록하면 채운다 — 첫 판을 등록하지 않았으면 없다 */
  scoreId?: number;
  rank?: number;
};

const FIRST_RUN_KEY = 'tetris:daily:first';

export function loadDailyFirstRun(boardKey: string): DailyFirstRun | null {
  const saved = readStorageJson<DailyFirstRun>('local', FIRST_RUN_KEY);
  return saved && saved.boardKey === boardKey && Number.isFinite(saved.score) ? saved : null;
}

/**
 * 판이 끝날 때 — 그 보드의 첫 판이면 저장하고 true, 이미 첫 판이 있으면 그대로 두고 false
 * 더 최근 날의 첫 판이 이미 있으면(자정 직전 세션으로 늦게 끝난 판·다른 탭) 덮지 않는다 — 키 날짜(YYYY-MM-DD)는 문자열 순서가 날짜 순서
 */
export function recordDailyRun(run: Omit<DailyFirstRun, 'scoreId' | 'rank'>): boolean {
  if (loadDailyFirstRun(run.boardKey)) return false;
  const saved = readStorageJson<DailyFirstRun>('local', FIRST_RUN_KEY);
  // 저장값이 데일리 키 형식이 아니면(손상·형식 변경) 비교하지 않고 덮는다 — 이상한 값 하나로 첫 판이 영영 막히지 않게
  if (saved && typeof saved.boardKey === 'string' && isDailyBoardKey(saved.boardKey) && saved.boardKey > run.boardKey) return false;
  writeStorage('local', FIRST_RUN_KEY, JSON.stringify(run));
  return true;
}

/** 첫 판을 등록했으면 순위를 붙인다 — 첫 판이 아닌 기록(다시 도전)은 무시 */
export function attachDailyRank(boardKey: string, scoreId: number, rank: number | null): void {
  const first = loadDailyFirstRun(boardKey);
  if (!first || (first.scoreId !== undefined && first.scoreId !== scoreId)) return;
  writeStorage('local', FIRST_RUN_KEY, JSON.stringify({ ...first, scoreId, ...(rank ? { rank } : {}) }));
}

/** Wordle식 공유 문구 — 첫 판 기준 */
export function dailyShareText(first: DailyFirstRun, url: string): string {
  const rank = first.rank ? ` · ${first.rank}위` : '';
  return `오늘의 테트리스 ${dailyDateLabel(first.boardKey)} 🟩 ${formatScore(first.score)}점${rank}\n🧱 ${first.lines}줄 · ⬆️ 레벨 ${first.level}\n${url}`;
}
