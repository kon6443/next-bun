import { type MutableRefObject, type RefObject, useEffect } from "react";

/** 조작부가 전장 위 오버레이가 되는 화면 — 클래스의 lg(Tailwind 64rem~)·short-land(globals.css)와 같은 조건 */
const OVERLAY_PANEL_QUERY = "(min-width: 64rem), (orientation: landscape) and (max-height: 500px)";

/**
 * 조작부 오버레이(데스크톱 lg · 휴대폰 가로 short-land) 높이·양옆 폭 — 카메라가 그만큼 비워 담는다
 * 매 프레임 레이아웃을 읽지 않게 크기가 바뀔 때만 재서 ref에 둔다(그리기 루프가 ref를 읽는다)
 * remeasure가 바뀌면(패드가 다시 마운트됨 — 차례·조준 가능 여부) 새 노드를 다시 관찰한다
 */
export function useOverlayInsets({
  panelRef,
  insetBottomRef,
  insetSideRef,
  remeasure,
}: {
  panelRef: RefObject<HTMLElement | null>;
  insetBottomRef: MutableRefObject<number>;
  insetSideRef: MutableRefObject<number>;
  remeasure: readonly unknown[];
}): void {
  useEffect(() => {
    const panel = panelRef.current;
    const wide = typeof window.matchMedia === "function" ? window.matchMedia(OVERLAY_PANEL_QUERY) : null;
    if (!panel || !wide) return;
    const measure = () => {
      insetBottomRef.current = wide.matches ? panel.offsetHeight : 0;
      // 터치 가로 — 패드가 전장 위 양끝에 겹친다(공용 GamePad의 landscape:absolute). 왼쪽 십자 묶음·오른쪽 버튼 묶음 중 넓은 쪽
      insetSideRef.current = 0;
      const pad = panel.querySelector<HTMLElement>('[data-testid="game-pad"]');
      if (pad && getComputedStyle(pad).position === "absolute") {
        const box = pad.getBoundingClientRect();
        const left = pad.querySelector('[data-testid="game-pad-dpad"]')?.getBoundingClientRect();
        const right = pad.querySelector('[role="group"][aria-label="버튼"]')?.getBoundingClientRect();
        insetSideRef.current = Math.max(left ? left.right - box.left : 0, right ? box.right - right.left : 0);
      }
    };
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(panel);
    // 가로 패드 크기는 화면 높이(vh)를 따른다 — 주소창이 접혀 높이만 바뀌어도 다시 잰다
    const pad = panel.querySelector('[data-testid="game-pad"]');
    if (pad) observer?.observe(pad);
    wide.addEventListener("change", measure);
    return () => {
      observer?.disconnect();
      wide.removeEventListener("change", measure);
    };
    // 떨어진 옛 패드 노드를 보고 있으면 높이(vh)만 바뀔 때 다시 재지 못한다 — remeasure로 다시 건다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, remeasure);
}
