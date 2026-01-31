'use client';

import { useState, useCallback } from 'react';

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

  const execute = useCallback(
    async (operation: () => Promise<T>): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await operation();
        onSuccess?.(result);
        return result;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : defaultErrorMessage;
        setError(errorMessage);
        onError?.(err instanceof Error ? err : new Error(errorMessage));
        console.error('useAsyncOperation error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, onError, defaultErrorMessage],
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

/**
 * 여러 독립적인 비동기 작업을 관리하는 훅
 * 각 작업별로 독립적인 로딩 상태를 유지
 */
export function useMultipleAsyncOperations<K extends string>() {
  const [loadingStates, setLoadingStates] = useState<Record<K, boolean>>({} as Record<K, boolean>);
  const [errors, setErrors] = useState<Record<K, string | null>>({} as Record<K, string | null>);

  const execute = useCallback(async <T>(key: K, operation: () => Promise<T>): Promise<T | null> => {
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    setErrors(prev => ({ ...prev, [key]: null }));

    try {
      const result = await operation();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '작업에 실패했습니다.';
      setErrors(prev => ({ ...prev, [key]: errorMessage }));
      console.error(`useMultipleAsyncOperations error [${key}]:`, err);
      return null;
    } finally {
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const isLoading = useCallback((key: K): boolean => loadingStates[key] ?? false, [loadingStates]);

  const getError = useCallback((key: K): string | null => errors[key] ?? null, [errors]);

  const resetError = useCallback((key: K) => {
    setErrors(prev => ({ ...prev, [key]: null }));
  }, []);

  return {
    execute,
    isLoading,
    getError,
    resetError,
    loadingStates,
    errors,
  };
}
