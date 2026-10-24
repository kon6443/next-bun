"use client";

import { useCallback, useRef } from "react";

/**
 * 판 입력 큐 — 누르고 있는 동작(누름 → 뗌 코드)과 다음 틱에 넘길 동작 코드 (싱글·대전 공용, games-polish FE-54)
 * 누름·즉시 동작은 진행 중(playing)에만 받는다. 뗌은 누르고 있던 것만
 * keepReleaseWhenStopped: 멈춘 동안 뗀 것도 큐에 남겨 재개 첫 프레임에 적용(싱글 일시정지). 대전은 멈추지 않아 버린다
 */
export function useInputQueue(statusRef: { readonly current: string }, { keepReleaseWhenStopped }: { keepReleaseWhenStopped: boolean }) {
  /** 다음 틱에 엔진에 넘길 동작 코드 */
  const queueRef = useRef<number[]>([]);
  /** 누르고 있는 동작: 누름 코드 → 뗌 코드 */
  const heldRef = useRef<Map<number, number>>(new Map());

  const press = useCallback(
    (pressCode: number, releaseCode: number) => {
      if (statusRef.current !== "playing" || heldRef.current.has(pressCode)) return;
      heldRef.current.set(pressCode, releaseCode);
      queueRef.current.push(pressCode);
    },
    [statusRef],
  );

  const release = useCallback(
    (pressCode: number) => {
      const releaseCode = heldRef.current.get(pressCode);
      if (releaseCode === undefined) return;
      heldRef.current.delete(pressCode);
      if (keepReleaseWhenStopped || statusRef.current === "playing") queueRef.current.push(releaseCode);
    },
    [statusRef, keepReleaseWhenStopped],
  );

  const instant = useCallback(
    (action: number) => {
      if (statusRef.current === "playing") queueRef.current.push(action);
    },
    [statusRef],
  );

  const releaseAll = useCallback(() => {
    for (const pressCode of Array.from(heldRef.current.keys())) release(pressCode);
  }, [release]);

  return { queueRef, heldRef, press, release, instant, releaseAll };
}
