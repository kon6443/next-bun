import { type RefObject, useRef } from "react";

/**
 * 첫 렌더에 한 번만 만드는 ref — useRef(init())는 렌더마다 init을 부른다(엔진 상태 생성 등 무거운 값)
 * T에 null이 들어가지 않는 값만 담는다(null을 "아직 안 만듦" 표시로 쓴다)
 */
export function useLazyRef<T extends NonNullable<unknown>>(init: () => T): RefObject<T> {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = init();
  // 위에서 채웠으니 이후 current는 늘 T다
  return ref as RefObject<T>;
}
