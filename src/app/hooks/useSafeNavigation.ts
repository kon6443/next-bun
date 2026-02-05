'use client';

import { useMemo } from 'react';
import {
  useSearchParams as useNextSearchParams,
  usePathname as useNextPathname,
} from 'next/navigation';

/**
 * Next.js 15+에서 useSearchParams와 usePathname이 null을 반환할 수 있는 문제를 해결하는 커스텀 훅
 *
 * Next.js 15부터 App Router의 useSearchParams()와 usePathname()이 특정 상황에서
 * null을 반환할 수 있어, 매번 optional chaining(?.)이나 nullish coalescing(??)을
 * 사용해야 하는 불편함이 있음.
 *
 * 이 훅은 안전한 기본값을 제공하여 null 체크 로직을 중앙화함.
 *
 * @example
 * // 기존 방식 (매번 null 체크 필요)
 * const searchParams = useSearchParams();
 * const value = searchParams?.get('key') ?? '';
 * const queryString = searchParams?.toString() ?? '';
 *
 * // 새로운 방식 (null 체크 불필요)
 * const { searchParams, pathname, getParam, buildQueryString } = useSafeNavigation();
 * const value = getParam('key');
 * const queryString = searchParams.toString();
 */

type SafeNavigationResult = {
  /** 안전한 URLSearchParams 객체 (항상 non-null) */
  searchParams: URLSearchParams;
  /** 안전한 pathname 문자열 (항상 non-null) */
  pathname: string;
  /**
   * 쿼리 파라미터 값을 안전하게 가져옴
   * @param key 파라미터 키
   * @param defaultValue 기본값 (기본: '')
   */
  getParam: (key: string, defaultValue?: string) => string;
  /**
   * 쿼리 파라미터를 설정하고 새로운 URLSearchParams를 반환
   * @param key 파라미터 키
   * @param value 값 (null/undefined 시 파라미터 삭제)
   */
  setParam: (key: string, value: string | null | undefined) => URLSearchParams;
  /**
   * 여러 쿼리 파라미터를 한번에 설정하고 새로운 URLSearchParams를 반환
   * @param params 설정할 파라미터 객체
   */
  setParams: (params: Record<string, string | null | undefined>) => URLSearchParams;
  /**
   * 현재 pathname에 쿼리 스트링을 추가한 전체 URL 경로 생성
   * @param additionalParams 추가할 파라미터 (선택)
   */
  buildPath: (additionalParams?: Record<string, string | null | undefined>) => string;
};

/**
 * Next.js 네비게이션 훅들을 안전하게 사용하기 위한 래퍼 훅
 */
export function useSafeNavigation(): SafeNavigationResult {
  const nextSearchParams = useNextSearchParams();
  const nextPathname = useNextPathname();

  // 안전한 URLSearchParams 객체 (null일 경우 빈 URLSearchParams 생성)
  const searchParams = useMemo(() => {
    if (!nextSearchParams) {
      return new URLSearchParams();
    }
    // ReadonlyURLSearchParams를 URLSearchParams로 복사
    return new URLSearchParams(nextSearchParams.toString());
  }, [nextSearchParams]);

  // 안전한 pathname (null일 경우 빈 문자열)
  const pathname = nextPathname ?? '';

  // 파라미터 안전하게 가져오기
  const getParam = (key: string, defaultValue = ''): string => {
    return searchParams.get(key) ?? defaultValue;
  };

  // 단일 파라미터 설정
  const setParam = (key: string, value: string | null | undefined): URLSearchParams => {
    const newParams = new URLSearchParams(searchParams.toString());
    if (value == null) {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    return newParams;
  };

  // 여러 파라미터 설정
  const setParams = (params: Record<string, string | null | undefined>): URLSearchParams => {
    const newParams = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value == null) {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    }
    return newParams;
  };

  // pathname + 쿼리스트링 빌드
  const buildPath = (additionalParams?: Record<string, string | null | undefined>): string => {
    const params = additionalParams ? setParams(additionalParams) : searchParams;
    const queryString = params.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  return {
    searchParams,
    pathname,
    getParam,
    setParam,
    setParams,
    buildPath,
  };
}

export default useSafeNavigation;
