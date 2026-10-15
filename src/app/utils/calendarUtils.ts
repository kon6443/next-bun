/** 캘린더 한 칸에 보이는 최대 줄 수 (멀티데이 바·단일 태스크 각각) */
export const CALENDAR_VISIBLE_ROWS = 2;

type WeekBar = { startCol: number; span: number; row: number };

/**
 * 한 날짜 칸에서 화면에 다 못 그려 "+N개"로 접히는 태스크 수
 * - 단일 태스크: 보이는 줄 수를 넘은 만큼
 * - 멀티데이 바: 보이는 줄 아래로 밀려난 바 중 이 날짜를 지나는 것
 * (예전에는 숨은 바를 토요일 칸에만 표시해 다른 요일에서는 볼 방법이 없었다)
 */
export function countHiddenTasksForDay(
  bars: readonly WeekBar[],
  dayIdx: number,
  singleTaskCount: number,
  visibleRows = CALENDAR_VISIBLE_ROWS,
): number {
  const hiddenSingles = Math.max(0, singleTaskCount - visibleRows);
  const hiddenBars = bars.filter(
    bar => bar.row >= visibleRows && dayIdx >= bar.startCol && dayIdx < bar.startCol + bar.span,
  ).length;
  return hiddenSingles + hiddenBars;
}

/** 'YYYY-MM' → 그 달 1일 (로컬). 없거나 형식이 틀리면 이번 달 */
export function parseCalendarMonth(month: string | undefined, today: Date = new Date()): Date {
  const match = month ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month) : null;
  if (!match) return new Date(today.getFullYear(), today.getMonth(), 1);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

/** Date → 'YYYY-MM' (로컬) */
export function formatCalendarMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** 팝오버 기본 최대 높이 (max-h-80) */
export const POPOVER_MAX_HEIGHT = 320;
/** 공간이 모자라도 이 높이까지는 보장한다 (항목 2개 남짓 — 더 줄이면 목록을 쓸 수 없다) */
export const POPOVER_MIN_HEIGHT = 96;

/**
 * 팝오버를 기준 버튼 아래·위 중 어디에, 어떤 최대 높이로 띄울지 (뷰포트 좌표)
 * - 위 경계: 달력 헤더(월 이동 버튼) 아래 — 위로 띄워도 헤더 버튼을 덮지 않게
 * - 아래 경계: 화면 하단 고정 요소(하단 내비·FAB) 위 — innerHeight 가 아니라 실제로 보이는 영역
 * 내용이 들어가는 쪽을 우선(아래 먼저), 둘 다 모자라면 더 넓은 쪽에 넣고 높이를 줄여 안에서 스크롤한다
 * placement 를 넘기면 방향은 그대로 두고 높이·위치만 다시 계산한다 (스크롤 중 위↔아래로 뒤집히지 않게)
 * 공간이 minHeight 보다 좁으면 목록을 쓸 수 있게 minHeight 를 보장한다 — 이때만 경계를 넘어 겹치는 것을 허용한다
 */
export function choosePopoverPlacement({
  anchorTop,
  anchorBottom,
  topLimit,
  bottomLimit,
  contentHeight,
  gap = 8,
  maxHeight = POPOVER_MAX_HEIGHT,
  minHeight = POPOVER_MIN_HEIGHT,
  placement: fixedPlacement,
}: {
  anchorTop: number;
  anchorBottom: number;
  topLimit: number;
  bottomLimit: number;
  contentHeight: number;
  gap?: number;
  maxHeight?: number;
  minHeight?: number;
  placement?: 'below' | 'above';
}): { placement: 'below' | 'above'; maxHeight: number; top: number } {
  const spaceBelow = bottomLimit - (anchorBottom + gap);
  // 위로 띄울 때 아래 끝 — 앵커가 하단 고정 요소(FAB·내비) 높이까지 내려와 있으면 앵커가 아니라 그 경계에 맞춘다
  const aboveBottom = Math.min(anchorTop - gap, bottomLimit);
  const spaceAbove = aboveBottom - topLimit;
  const wanted = Math.min(contentHeight, maxHeight);

  let placement: 'below' | 'above';
  if (fixedPlacement) placement = fixedPlacement;
  else if (wanted <= spaceBelow) placement = 'below';
  else if (wanted <= spaceAbove) placement = 'above';
  else placement = spaceBelow >= spaceAbove ? 'below' : 'above';

  const space = placement === 'below' ? spaceBelow : spaceAbove;
  const limitedMax = Math.max(minHeight, Math.min(maxHeight, space));
  const height = Math.min(contentHeight, limitedMax);
  const top = placement === 'below' ? anchorBottom + gap : aboveBottom - height;
  return { placement, maxHeight: limitedMax, top };
}
