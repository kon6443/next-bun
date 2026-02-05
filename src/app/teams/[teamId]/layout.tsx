'use client';

import { type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { TeamSocketProvider } from './contexts';

interface TeamLayoutProps {
  children: ReactNode;
}

/**
 * Team Layout
 *
 * teams/[teamId] 하위의 모든 페이지를 감싸는 레이아웃입니다.
 * TeamSocketProvider를 통해 하위 페이지들이 동일한 소켓 연결을 공유합니다.
 *
 * 이 레이아웃 덕분에:
 * - 팀 상세 페이지 ↔ 태스크 상세 페이지 이동 시 소켓 연결이 유지됩니다.
 * - 입퇴장 알림 중복 문제가 해결됩니다.
 * - URL 직접 입력으로 접속해도 소켓 연결이 정상 작동합니다.
 */
export default function TeamLayout({ children }: TeamLayoutProps) {
  const params = useParams();
  const teamId = params?.teamId;

  // teamId 파싱
  const teamIdNum = typeof teamId === 'string' ? parseInt(teamId, 10) : NaN;

  // teamId가 유효하지 않은 경우 Provider 없이 렌더링
  // (하위 페이지에서 적절한 에러 처리를 합니다)
  if (!teamId || isNaN(teamIdNum) || teamIdNum <= 0) {
    return <>{children}</>;
  }

  return (
    <TeamSocketProvider teamId={teamIdNum}>
      {children}
    </TeamSocketProvider>
  );
}
