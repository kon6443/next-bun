"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { createTeam } from "@/services/teamService";
import {
  TeamsPageLayout,
  Button,
  ButtonLink,
  Input,
  TextArea,
  SectionLabel,
  ErrorAlert,
} from "../components";
import { cardStyles } from "@/styles/teams";

export default function CreateTeamPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!teamName.trim() || !teamDescription.trim()) {
      setError("팀 이름과 설명을 모두 입력해주세요.");
      return;
    }

    if (!session?.user?.accessToken) {
      setError("인증이 필요합니다. 다시 로그인해주세요.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createTeam(
        {
          teamName: teamName.trim(),
          teamDescription: teamDescription.trim(),
        },
        session.user.accessToken
      );

      router.push("/teams");
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "팀 생성에 실패했습니다.";
      setError(errorMessage);
      console.error("Failed to create team:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <TeamsPageLayout>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <ButtonLink href="/teams" variant="secondary">
          ← 팀 목록으로 돌아가기
        </ButtonLink>
      </div>

      {/* 팀 생성 폼 */}
      <section className={`${cardStyles.section} p-4`}>
        <div className="mb-4">
          <SectionLabel>New Team</SectionLabel>
          <h1 className="mt-3 text-2xl font-bold text-white">
            새 팀 생성
          </h1>
        </div>

        {error && <ErrorAlert message={error} className="mb-4" />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="teamName"
            label="팀 이름"
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="팀 이름을 입력하세요"
            disabled={isSubmitting}
          />

          <TextArea
            id="teamDescription"
            label="팀 설명"
            required
            value={teamDescription}
            onChange={(e) => setTeamDescription(e.target.value)}
            placeholder="팀에 대한 상세 설명을 입력하세요"
            disabled={isSubmitting}
          />

          <div className="flex flex-col-reverse justify-end gap-2 pt-2">
            <ButtonLink href="/teams" variant="secondary">
              취소
            </ButtonLink>
            <Button
              type="submit"
              disabled={
                isSubmitting || !teamName.trim() || !teamDescription.trim()
              }
            >
              {isSubmitting ? "생성 중..." : "팀 생성"}
            </Button>
          </div>
        </form>
      </section>
    </TeamsPageLayout>
  );
}
