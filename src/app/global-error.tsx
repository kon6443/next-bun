'use client';

import { GlobalErrorLayout } from './components/ErrorPageLayout';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <GlobalErrorLayout
      title="500"
      subtitle="서버 오류"
      description="서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요."
      buttonText="다시 시도"
      onButtonClick={reset}
    />
  );
}
