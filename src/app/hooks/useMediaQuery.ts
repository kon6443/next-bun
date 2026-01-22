'use client';

import { useState, useEffect } from 'react';

/**
 * 미디어 쿼리 매칭 여부를 반환하는 훅
 * @param query - CSS 미디어 쿼리 문자열 (예: '(min-width: 768px)')
 * @returns 미디어 쿼리 매칭 여부
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // SSR 환경에서는 window가 없으므로 체크
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    
    // 초기값 설정
    setMatches(mediaQuery.matches);

    // 변경 감지 핸들러
    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // 이벤트 리스너 등록
    mediaQuery.addEventListener('change', handler);

    // 클린업
    return () => {
      mediaQuery.removeEventListener('change', handler);
    };
  }, [query]);

  return matches;
}

/**
 * 모바일 여부를 반환하는 훅 (Tailwind md 브레이크포인트 기준: 768px)
 * @returns true이면 데스크톱, false이면 모바일
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

/**
 * 모바일 여부를 반환하는 훅
 * @returns true이면 모바일, false이면 데스크톱
 */
export function useIsMobile(): boolean {
  const isDesktop = useIsDesktop();
  return !isDesktop;
}
