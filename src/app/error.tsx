'use client';

import { useEffect } from 'react';
import { ErrorPageLayout } from './components/ErrorPageLayout';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <ErrorPageLayout
      title="오류 발생"
      subtitle="문제가 발생했습니다"
      description="예기치 않은 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
      buttonText="다시 시도"
      onButtonClick={reset}
    />
  );
}
