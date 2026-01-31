'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';

type UseAuthenticatedFetchResult<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

/**
 * 인증된 사용자를 위한 데이터 페칭 훅
 * 세션 체크 + API 호출 + 에러 처리 패턴을 재사용 가능하게 추상화
 *
 * @param fetchFn - 액세스 토큰을 받아 데이터를 반환하는 함수
 * @param options - 추가 옵션 (enabled, onSuccess, onError)
 */
export function useAuthenticatedFetch<T>(
  fetchFn: (accessToken: string) => Promise<T>,
  options: {
    enabled?: boolean;
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {},
): UseAuthenticatedFetchResult<T> {
  const { data: session, status } = useSession();
  const { enabled = true, onSuccess, onError } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useRef로 콜백을 저장하여 의존성에서 제외 (무한 루프 방지)
  const fetchFnRef = useRef(fetchFn);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);

  // 매 렌더링마다 ref 업데이트
  fetchFnRef.current = fetchFn;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const execute = useCallback(async () => {
    // 세션 로딩 중이면 대기
    if (status === 'loading') {
      return;
    }

    // 비로그인 상태 또는 비활성화된 경우
    if (status === 'unauthenticated' || !session?.user?.accessToken || !enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFnRef.current(session.user.accessToken);
      setData(result);
      onSuccessRef.current?.(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '데이터를 불러오는데 실패했습니다.';
      setError(errorMessage);
      onErrorRef.current?.(err instanceof Error ? err : new Error(errorMessage));
      console.error('useAuthenticatedFetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [status, session?.user?.accessToken, enabled]);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    data,
    isLoading: status === 'loading' || isLoading,
    error,
    refetch: execute,
  };
}
