'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * "마지막으로 시작한 작업이 끝날 때만 꺼지는" 진행 표시 플래그
 *
 * 같은 플래그로 작업이 겹치면(탭 연타 등) 먼저 시작한 작업이 늦게 끝나도 표시를 끄지 않는다.
 * 플래그마다 순번을 따로 가진다 — 서로 다른 표시(초기 로딩·탭 재조회)가 순번을 공유하면
 * 한쪽이 다른 쪽 표시를 끄지 못하게 막아 영원히 켜진 채 남는다.
 *
 * @returns [켜짐 여부, 작업을 감싸 실행하는 함수, 직접 설정(작업 없이 끌 때)]
 */
export function useLatestFlag(initial: boolean) {
  const [active, setActive] = useState(initial);
  const seqRef = useRef(0);

  const track = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    const seq = ++seqRef.current;
    setActive(true);
    try {
      return await task();
    } finally {
      if (seq === seqRef.current) setActive(false);
    }
  }, []);

  return [active, track, setActive] as const;
}
