'use client';

import { useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getMyTeams, type TeamMemberResponse } from '@/services/teamService';
import type { TeamSummary } from '@/types/team';
import { useAuthenticatedFetch } from '@/app/hooks';
import TeamsClient from './TeamsClient';

export default function TeamsPage() {
  const { data: session } = useSession();

  // API 응답을 TeamSummary 배열로 변환하는 함수
  const fetchTeams = useCallback(async (accessToken: string) => {
    const response = await getMyTeams(accessToken);
    return response.data.map(
      (team: TeamMemberResponse): TeamSummary => ({
        teamId: team.teamId,
        name: team.teamName,
        description: team.teamDescription || '',
        role: team.role,
      }),
    );
  }, []);

  // useAuthenticatedFetch 훅으로 세션 체크 + API 호출 + 에러 처리 통합
  const { data: teams, isLoading, error } = useAuthenticatedFetch(fetchTeams);

  return <TeamsClient session={session} initialTeams={teams ?? []} error={error} isLoading={isLoading} />;
}
