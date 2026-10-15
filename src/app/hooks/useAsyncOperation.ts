'use client';

import { useState, useCallback, useRef } from 'react';

type UseAsyncOperationResult<T> = {
  isLoading: boolean;
  error: string | null;
  execute: (operation: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
};

/**
 * 비동기 작업(제출, 업데이트 등)을 위한 상태 관리 훅
 * 로딩/에러 상태 처리를 재사용 가능하게 추상화
 *
 * @param options - 추가 옵션 (onSuccess, onError, defaultErrorMessage)
 */
export function useAsyncOperation<T = void>(
  options: {
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
    defaultErrorMessage?: string;
  } = {},
): UseAsyncOperationResult<T> {
  const { onSuccess, onError, defaultErrorMessage = '작업에 실패했습니다.' } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const defaultErrorMessageRef = useRef(defaultErrorMessage);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  defaultErrorMessageRef.current = defaultErrorMessage;

  const execute = useCallback(
    async (operation: () => Promise<T>): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await operation();
        onSuccessRef.current?.(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : defaultErrorMessageRef.current;
        setError(errorMessage);
        onErrorRef.current?.(err instanceof Error ? err : new Error(errorMessage));
        console.error('useAsyncOperation error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    execute,
    reset,
  };
}
