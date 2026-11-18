"use client";

import { useEffect, useRef } from "react";

/** 재생기 키 — Space 재생/정지, ←/→ 앞뒤로 */
export type ReplayKey = "toggle" | "back" | "forward";

function replayKeyOf(e: KeyboardEvent, arrowField: "code" | "key"): ReplayKey | null {
  if (e.code === "Space") return "toggle";
  const arrow = e[arrowField];
  if (arrow === "ArrowLeft") return "back";
  if (arrow === "ArrowRight") return "forward";
  return null;
}

type Handlers = {
  togglePlay: () => void;
  /** ← -1, → +1 — 얼마나 옮길지는 게임이 정한다 */
  seekBy: (direction: -1 | 1) => void;
  /**
   * 이 키를 재생기가 받지 않을 때 true(그 요소·대화상자의 몫) — 게임마다 다르다:
   * 테트리스는 버튼에서 Space만 버튼에 두고 ←/→는 재생을 옮긴다, 디펜스는 버튼·링크·막대에 포커스가 있으면 모두 그 요소에 둔다
   */
  skip: (e: KeyboardEvent, key: ReplayKey) => boolean;
  /**
   * ←/→를 무엇으로 알아볼지 — 테트리스는 물리 키(`code`), 디펜스는 글자(`key`)로 봐 왔다.
   * NumLock이 꺼진 숫자패드 4/6(code=Numpad4·key=ArrowLeft)에서만 갈린다 — 게임별 기존 동작을 그대로 둔다
   */
  arrowField: "code" | "key";
};

/** 재생기 공통 키(테트리스·디펜스) — window keydown, 받은 키는 기본 동작(스크롤)을 막는다 */
export function useReplayKeys(enabled: boolean, handlers: Handlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const key = replayKeyOf(e, ref.current.arrowField);
      if (key === null || ref.current.skip(e, key)) return;
      e.preventDefault();
      if (key === "toggle") ref.current.togglePlay();
      else ref.current.seekBy(key === "back" ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
