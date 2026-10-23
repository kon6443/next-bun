"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTypingTarget } from "../../lib/controls";

/**
 * 판 하나 크게 보기 (FE-28) — 탈락 후 관전·경기 기록 재생에서 판을 누르면 그 판만 크게, 돌아가기·Esc로 원래 배치로
 * 크게 볼 때는 돌아가기 버튼에, 돌아오면 누른 판에 포커스를 둔다. enabled가 꺼지면(다시 경기 등) 원래 배치로 — 포커스는 옮기지 않는다
 *
 * 판은 버튼 역할의 div다(안에 캔버스 div가 있어 <button>으로 감쌀 수 없다) — boardProps가 역할·키보드·라벨을 준다
 */
export function useBoardFocus(enabled: boolean) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const boardsRef = useRef(new Map<string, HTMLElement>());
  const backRef = useRef<HTMLButtonElement | null>(null);
  /** 마지막으로 크게 본 판 — 돌아오면 여기에 포커스 */
  const lastRef = useRef<string | null>(null);
  const active = enabled ? focusedId : null;

  const open = useCallback((id: string) => {
    lastRef.current = id;
    setFocusedId(id);
  }, []);
  const close = useCallback(() => setFocusedId(null), []);

  useEffect(() => {
    if (enabled) return;
    lastRef.current = null;
    setFocusedId(null);
  }, [enabled]);

  useEffect(() => {
    if (active) {
      backRef.current?.focus();
      return;
    }
    const id = lastRef.current;
    lastRef.current = null;
    if (id) boardsRef.current.get(id)?.focus();
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // 입력창(관전 채팅)에서의 Esc는 입력 쪽 몫이다
      if (e.key !== "Escape" || isTypingTarget(e.target)) return;
      e.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, close]);

  /** 판에 줄 속성 — 크게 보는 중인 판은 더 누를 게 없어 버튼이 아니다. enabled가 아니면 아무것도 */
  const boardProps = (id: string, name: string) => {
    if (!enabled || active === id) return {};
    return {
      ref: (el: HTMLElement | null) => {
        if (el) boardsRef.current.set(id, el);
        else boardsRef.current.delete(id);
      },
      role: "button" as const,
      tabIndex: 0,
      "aria-label": `${name} 화면 크게 보기`,
      onClick: () => open(id),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        // 재생 화면의 Space(재생/정지)까지 가지 않게
        e.preventDefault();
        e.stopPropagation();
        open(id);
      },
    };
  };

  return { focusedId: active, open, close, backRef, boardProps };
}
