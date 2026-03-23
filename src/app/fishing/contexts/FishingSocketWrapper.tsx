'use client';

import { useSession } from 'next-auth/react';
import { FishingSocketProvider } from './FishingSocketContext';
import type { ReactNode } from 'react';

/**
 * 세션 상태 로딩이 끝나면 FishingSocketProvider를 렌더링.
 * 로그인/비로그인 모두 멀티플레이어 지원 (비로그인은 게스트 모드).
 */
export function FishingSocketWrapper({ children }: { children: ReactNode }) {
  const { status } = useSession();

  // 세션 로딩 중이면 Provider 없이 렌더 (소켓 연결 대기)
  if (status === 'loading') {
    return <>{children}</>;
  }

  return (
    <FishingSocketProvider mapId="river">
      {children}
    </FishingSocketProvider>
  );
}
