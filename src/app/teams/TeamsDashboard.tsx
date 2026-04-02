'use client';

import { useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { getMyTeams, type TeamMemberResponse } from '@/services/teamService';
import type { TeamSummary } from '@/types/team';
import { useAuthenticatedFetch } from '@/app/hooks';
import TeamsClient from './TeamsClient';

export default function TeamsDashboard() {
  const { data: session } = useSession();

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

  const { data: teams, isLoading, error } = useAuthenticatedFetch(fetchTeams);

  return <TeamsClient session={session} initialTeams={teams ?? []} error={error} isLoading={isLoading} />;
}
