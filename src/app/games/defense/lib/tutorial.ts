export type TutorialStep = 0 | 1 | 2;

/**
 * S1 튜토리얼 단계 (§F5) — 판 상태로만 정한다(되돌아가도 단계가 어긋나지 않게)
 * 0: 아무 슬롯도 안 열었다 → 1: 링을 열었다(타워 없음) → 2: 타워가 하나 이상(웨이브 전) → 끝: 웨이브 시작
 * 링을 닫으면 다시 0 — 타워가 있으면 2
 */
export function tutorialStep(view: { ringOpen: boolean; towers: number; wavesStarted: number }): TutorialStep | null {
  if (view.wavesStarted > 0) return null;
  if (view.towers > 0) return 2;
  return view.ringOpen ? 1 : 0;
}

/** 첫 단계에서 가리킬 슬롯 — 조작 가이드(s1Guide) 첫 건설 자리 */
export const TUTORIAL_SLOT = 7;

/** 말풍선이 덮는 띠 높이(CSS px) — 가장자리 여백 12 + 세 줄 말풍선(320px 폭, 1단계 문구) + 여유 */
export const TUTORIAL_BUBBLE_BAND = 96;
/** 말풍선에 붙는 시작 안내 한 장(두 줄 + 간격) */
export const TUTORIAL_NOTICE_BAND = 48;

/**
 * 말풍선을 위(true)·아래(false) 중 어디에 둘지 — 가리키는 곳(focus: 세로 범위)을 덮지 않는 쪽 중 슬롯을 덜 덮는 쪽
 * 둘이 같으면 preferAbove. 화면 좌표(CSS px), 슬롯은 중심 y와 반지름, band = 말풍선(+ 붙는 안내) 띠 높이
 */
export function tutorialBubbleAbove(height: number, slotYs: readonly number[], slotRadius: number, focus: { top: number; bottom: number } | null, preferAbove: boolean, band = TUTORIAL_BUBBLE_BAND): boolean {
  const cost = (above: boolean) => {
    const top = above ? 0 : height - band;
    const bottom = above ? band : height;
    const covers = (from: number, to: number) => to > top && from < bottom;
    let n = focus && covers(focus.top, focus.bottom) ? 1000 : 0;
    for (const y of slotYs) if (covers(y - slotRadius, y + slotRadius)) n += 1;
    return n;
  };
  const above = cost(true);
  const below = cost(false);
  return above === below ? preferAbove : above < below;
}
