/**
 * 조준 키보드 규칙 (순수) — 전역 keydown을 조준 동작으로 바꾼다 (D-022 원작 배치)
 * ←→·A/D 이동(반대쪽이면 먼저 돌아서기) · ↑↓·W/S 포신 올리기·내리기 · Q/E 파워 ∓1 · 스페이스 길게 = 충전 발사
 * 글자 키는 물리 키(code) — 한글 입력 상태에서도. 수정키(⌘·Ctrl·Alt)가 붙으면 브라우저 단축키라 손대지 않는다
 */

/**
 * 키를 받는 요소 — 조작부는 마우스·터치로 눌러도 버튼에 포커스를 남기지 않는다(FortressMatch의 onMouseDown).
 * 그래서 "button" = 키보드(Tab)로 들어간 버튼이고, 스페이스·Enter는 그 버튼 몫이다
 * (:focus-visible로 가르면 안 된다 — 마우스로 누른 버튼도 키를 누르는 순간 :focus-visible이 된다)
 * 파워 슬라이더도 포인터로 놓으면 포커스를 놓는다 — "range" = 키보드로 들어간 슬라이더
 */
export type KeyFocus = "none" | "button" | "range" | "text";

export type AimKeyAction =
  | { kind: "move"; dir: 1 | -1 }
  | { kind: "elevate"; delta: number }
  | { kind: "power"; delta: number }
  | { kind: "charge" }
  | { kind: "hold" };

export type KeyInput = { key: string; code: string; repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/** 슬라이더가 값으로 쓰는 키 — 키보드로 들어간 슬라이더에서는 화살표 넷 모두 파워(브라우저 기본 동작) */
const RANGE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"]);

/** 포커스된 요소가 그 키를 직접 쓰나 — 버튼은 스페이스·Enter(누르기), 슬라이더는 화살표 등(값), 글 입력은 전부 */
function ownedByFocus(key: string, focus: KeyFocus): boolean {
  if (focus === "text") return true;
  if (focus === "button") return key === " " || key === "Enter";
  if (focus === "range") return RANGE_KEYS.has(key);
  return false;
}

/** 조준 동작 — 없으면 null(브라우저·포커스 요소에 맡긴다) */
export function aimKeyAction(e: KeyInput, focus: KeyFocus): AimKeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ownedByFocus(e.key, focus)) return null;
  if (e.key === "ArrowLeft" || e.code === "KeyA") return { kind: "move", dir: -1 };
  if (e.key === "ArrowRight" || e.code === "KeyD") return { kind: "move", dir: 1 };
  if (e.key === "ArrowUp" || e.code === "KeyW") return { kind: "elevate", delta: 1 };
  if (e.key === "ArrowDown" || e.code === "KeyS") return { kind: "elevate", delta: -1 };
  if (e.code === "KeyQ") return { kind: "power", delta: -1 };
  if (e.code === "KeyE") return { kind: "power", delta: 1 };
  // 누르고 있는 동안의 자동 반복은 삼키기만 한다(충전은 처음 한 번, 기본 동작 — 스크롤·버튼 누르기 — 은 막는다)
  if (e.key === " ") return e.repeat ? { kind: "hold" } : { kind: "charge" };
  return null;
}

/** DOM 요소 → KeyFocus */
export function focusKind(el: EventTarget | null): KeyFocus {
  if (!(el instanceof HTMLElement)) return "none";
  if (el instanceof HTMLInputElement && el.type === "range") return "range";
  if (el.closest("input, select, textarea, [contenteditable='true']")) return "text";
  return el.closest("button, a") ? "button" : "none";
}
