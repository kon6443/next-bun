"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { getMyTeams, type TeamMemberResponse } from "@/services/teamService";
import TeamsClient from "./TeamsClient";

type TeamSummary = {
  teamId: number;
  name: string;
  description: string;
  role: string;
};

export default function TeamsPage() {
  const { data: session, status } = useSession();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 세션 로딩 중이면 대기
    if (status === "loading") {
      return;
    }

    // 비로그인 상태면 로딩 완료
    if (status === "unauthenticated" || !session?.user?.accessToken) {
      setIsLoading(false);
      return;
    }

    // 로그인 상태면 팀 목록 조회
    const fetchTeams = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getMyTeams(session.user.accessToken);
        const mappedTeams = response.data.map((team: TeamMemberResponse) => ({
          teamId: team.teamId,
          name: team.teamName,
          description: team.teamDescription || "",
          role: team.role,
        }));
        setTeams(mappedTeams);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "팀 목록을 불러오는데 실패했습니다.";
        setError(errorMessage);
        console.error("Failed to fetch teams:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeams();
  }, [status, session?.user?.accessToken]);

  return (
    <TeamsClient
      session={session}
      initialTeams={teams}
      error={error}
      isLoading={status === "loading" || isLoading}
    />
  );
}
