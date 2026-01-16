import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMyTeams, type TeamMemberResponse } from "@/services/teamService";
import TeamsClient from "./TeamsClient";

type TeamSummary = {
  teamId: number;
  name: string;
  description: string;
  role: string;
};

export default async function TeamsPage() {
  const session = await getServerSession(authOptions);
  
  let teams: TeamSummary[] = [];
  let error: string | null = null;

  if (session?.user?.accessToken) {
    try {
      const response = await getMyTeams(session.user.accessToken);
      teams = response.data.map((team: TeamMemberResponse) => ({
        teamId: team.teamId,
        name: team.teamName,
        description: team.teamDescription || "",
        role: team.role,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "팀 목록을 불러오는데 실패했습니다.";
      error = errorMessage;
      console.error("Failed to fetch teams:", err);
    }
  }

  return <TeamsClient session={session} initialTeams={teams} error={error} />;
}
