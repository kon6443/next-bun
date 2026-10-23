import { useCallback, useRef } from "react";

/**
 * 마지막 요청만 반영한다 — begin()이 돌려준 isLatest()가 false면 그사이 새 요청이 시작된 것(늦게 온 이전 응답은 버린다)
 */
export function useLatestRequest(): () => () => boolean {
  const idRef = useRef(0);
  return useCallback(() => {
    const id = ++idRef.current;
    return () => id === idRef.current;
  }, []);
}
