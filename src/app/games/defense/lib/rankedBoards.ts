/**
 * 무한·주간 보드 (defense DESIGN §B3·§F1·§F9b) — 화면 표기와, 세션을 못 받았을 때 로컬 판에 쓸 보드 키
 * 정식 보드 키·seed는 서버 세션이 정한다. 엔진을 import하지 않는다(허브·랭킹 번들)
 */

export type RankedMode = 'endless' | 'weekly';

/** 현재 무한 시즌 보드 — 서버 resolveSessionBoard의 시즌과 같아야 로컬 판이 같은 맵·규칙이 된다 */
export const ENDLESS_BOARD_KEY = 'endless-s1';

const WEEKLY_KEY = /^weekly-(\d{4})-w(\d{2})$/;
const ENDLESS_KEY = /^endless-s(\d+)$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 지금(KST)의 주간 보드 키 — ISO 주차(월요일 시작, 그 주 목요일이 속한 해), 서버와 같은 KST 월요일 00:00 경계(§B3)
 * 세션을 못 받은 로컬 판의 보드 표기용 — 등록되지 않는다
 */
export function weeklyBoardKeyAt(nowMs: number): string {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  const day = (kst.getUTCDay() + 6) % 7; // 월요일 0
  const thursday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) + (3 - day) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY_MS)) + 1;
  return `weekly-${year}-w${String(week).padStart(2, '0')}`;
}

export function modeOfBoardKey(boardKey: string): RankedMode | null {
  if (ENDLESS_KEY.test(boardKey)) return 'endless';
  if (WEEKLY_KEY.test(boardKey)) return 'weekly';
  return null;
}

/** 'W43 주간 도전' · '무한 모드 시즌 1' — 시작·결과·랭킹 화면 표기(일요일 밤 시작 혼동 방지, §F9b) */
export function boardTitle(boardKey: string): string {
  const weekly = WEEKLY_KEY.exec(boardKey);
  if (weekly) return `W${Number(weekly[2])} 주간 도전`;
  const endless = ENDLESS_KEY.exec(boardKey);
  if (endless) return `무한 모드 시즌 ${endless[1]}`;
  return boardKey;
}

/** 순위 앞 보드 표기 — '무한 시즌 1' · 'W43 주간' (공유 카드·메타: "무한 시즌 1 · 1위"), 모르는 키면 null */
export function boardRankLabel(boardKey: string | undefined, korean = true): string | null {
  if (!boardKey) return null;
  const weekly = WEEKLY_KEY.exec(boardKey);
  if (weekly) return korean ? `W${Number(weekly[2])} 주간` : `WEEKLY W${Number(weekly[2])}`;
  const endless = ENDLESS_KEY.exec(boardKey);
  if (endless) return korean ? `무한 시즌 ${endless[1]}` : `ENDLESS S${endless[1]}`;
  return null;
}

/** 짧은 표기 — 'W43' · '시즌 1' (탭·카드) */
export function boardShortTitle(boardKey: string): string {
  const weekly = WEEKLY_KEY.exec(boardKey);
  if (weekly) return `W${Number(weekly[2])}`;
  const endless = ENDLESS_KEY.exec(boardKey);
  if (endless) return `시즌 ${endless[1]}`;
  return boardKey;
}

/** 랭킹 화면 ?board= — 보드 키 또는 모드 별칭(endless·weekly = 그 모드의 현재 보드) */
export const BOARD_PARAM = /^(endless|weekly|endless-s\d{1,3}|weekly-\d{4}-w\d{2})$/;

export type BoardTab = { boardKey: string; mode: RankedMode; label: string; current: boolean };

/**
 * /boards 목록 → 랭킹 탭 (D-024) — 무한(현재 시즌 → 지난 시즌) · 주간(이번 주 → 지난 주)
 * 목록을 못 받으면 현재 무한 시즌 하나
 */
export function boardTabs(boards: readonly { boardKey: string; mode: string | null; current: boolean }[] | null): BoardTab[] {
  const tabs: BoardTab[] = [];
  for (const board of boards ?? []) {
    const mode = modeOfBoardKey(board.boardKey);
    if (!mode || board.mode !== mode) continue;
    const label = mode === 'endless' ? (board.current ? `무한 ${boardShortTitle(board.boardKey)}` : `지난 시즌 ${boardShortTitle(board.boardKey)}`) : board.current ? `이번 주 ${boardShortTitle(board.boardKey)}` : `지난 주 ${boardShortTitle(board.boardKey)}`;
    tabs.push({ boardKey: board.boardKey, mode, label, current: board.current });
  }
  if (!tabs.some((t) => t.mode === 'endless')) tabs.unshift({ boardKey: ENDLESS_BOARD_KEY, mode: 'endless', label: `무한 ${boardShortTitle(ENDLESS_BOARD_KEY)}`, current: true });
  // 무한 먼저, 같은 모드에서는 현재 → 지난(목록 순서 유지)
  return [...tabs.filter((t) => t.mode === 'endless' && t.current), ...tabs.filter((t) => t.mode === 'endless' && !t.current), ...tabs.filter((t) => t.mode === 'weekly' && t.current), ...tabs.filter((t) => t.mode === 'weekly' && !t.current)];
}

/** ?board= 값 → 보일 보드 키. 별칭은 그 모드의 현재 탭(없으면 그 모드 첫 탭), 목록에 없는 키도 형식이 맞으면 그대로(오래된 주) */
export function selectBoard(tabs: readonly BoardTab[], param: string | null): string {
  if (param && (param === 'endless' || param === 'weekly')) {
    const ofMode = tabs.filter((t) => t.mode === param);
    return (ofMode.find((t) => t.current) ?? ofMode[0] ?? tabs[0]).boardKey;
  }
  if (param && BOARD_PARAM.test(param)) return param;
  return tabs[0].boardKey;
}
