"use client";

import { useCallback, useRef } from "react";

/**
 * 판 입력 큐 — 누르고 있는 동작(누름 → 뗌 코드)과 다음 틱에 넘길 동작 코드 (싱글·대전 공용, games-polish FE-54)
 * 누름·즉시 동작은 진행 중(playing)에만 받는다. 뗌은 누르고 있던 것만
 * keepReleaseWhenStopped: 멈춘 동안 뗀 것도 큐에 남겨 재개 첫 프레임에 적용(싱글 일시정지). 대전은 멈추지 않아 버린다
 * 같은 프레임 탭 래치(games-polish P9): 누름이 아직 엔진에 안 간 채(큐에 있는 채) 떼면 뗌을 다음 틱으로 미룬다 —
 * 한 프레임(16ms)보다 짧은 탭에서 누름·뗌이 같은 프레임에 들어가 소프트 드롭이 아무 일도 안 하던 것(엔진은 그 프레임 끝의 상태만 본다)
 * 틱은 take()로 꺼내고, 판을 새로 시작·버릴 때는 clear()
 */
export function useInputQueue(statusRef: { readonly current: string }, { keepReleaseWhenStopped }: { keepReleaseWhenStopped: boolean }) {
  /** 다음 틱에 엔진에 넘길 동작 코드 */
  const queueRef = useRef<number[]>([]);
  /** 누르고 있는 동작: 누름 코드 → 뗌 코드 */
  const heldRef = useRef<Map<number, number>>(new Map());
  /** 다음 틱으로 미룬 뗌 코드(같은 프레임 탭 래치) */
  const latchedRef = useRef<number[]>([]);

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
      if (!keepReleaseWhenStopped && statusRef.current !== "playing") return;
      if (queueRef.current.includes(pressCode)) latchedRef.current.push(releaseCode);
      else queueRef.current.push(releaseCode);
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

  /** 이번 틱에 엔진에 넘길 동작 — 미뤄 둔 뗌은 다음 틱 큐로 옮긴다 */
  const take = useCallback((): number[] => {
    const actions = queueRef.current;
    queueRef.current = latchedRef.current;
    latchedRef.current = [];
    return actions;
  }, []);

  /** 판을 새로 시작하거나 버릴 때 — 보낼 동작·미룬 뗌을 비운다(눌림 표시는 부르는 쪽이 heldRef로) */
  const clear = useCallback(() => {
    queueRef.current = [];
    latchedRef.current = [];
  }, []);

  return { queueRef, heldRef, press, release, instant, releaseAll, take, clear };
}
