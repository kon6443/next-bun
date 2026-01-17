"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { updateTeam, getTeamTasks } from "@/services/teamService";
import { TeamsPageLayout } from "../../components";
import { cardStyles } from "@/styles/teams";

type EditTeamPageProps = {
  params: Promise<{ teamId: string }>;
};

export default function EditTeamPage({ params }: EditTeamPageProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [teamId, setTeamId] = useState<string>("");
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolvedParams) => {
      setTeamId(resolvedParams.teamId);
    });
  }, [params]);

  useEffect(() => {
    if (!teamId || !session?.user?.accessToken) {
      return;
    }

    const fetchTeamInfo = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const teamIdNum = parseInt(teamId, 10);
        if (isNaN(teamIdNum)) {
          throw new Error("유효하지 않은 팀 ID입니다.");
        }

        const response = await getTeamTasks(teamIdNum, session.user.accessToken);
        setTeamName(response.data.team.teamName);
        setTeamDescription(response.data.team.teamDescription || "");
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : "팀 정보를 불러오는데 실패했습니다.";
        setError(errorMessage);
        console.error("Failed to fetch team info:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamInfo();
  }, [teamId, session?.user?.accessToken]);

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

    if (!teamId) {
      setError("팀 ID가 없습니다.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const teamIdNum = parseInt(teamId, 10);
      if (isNaN(teamIdNum)) {
        throw new Error("유효하지 않은 팀 ID입니다.");
      }

      await updateTeam(
        teamIdNum,
        {
          teamName: teamName.trim(),
          teamDescription: teamDescription.trim(),
        },
        session.user.accessToken
      );

      router.push(`/teams/${teamId}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "팀 수정에 실패했습니다.";
      setError(errorMessage);
      console.error("Failed to update team:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <TeamsPageLayout maxWidth="4xl">
        <div className={`${cardStyles.section} p-8 text-center`}>
          <p className="text-slate-400">팀 정보를 불러오는 중...</p>
        </div>
      </TeamsPageLayout>
    );
  }

  return (
    <TeamsPageLayout maxWidth="4xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Link
          href={`/teams/${teamId}`}
          className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
        >
          ← 팀 상세로 돌아가기
        </Link>
      </div>

      {/* 팀 수정 폼 */}
      <section className={`${cardStyles.section} p-8`}>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.6em] text-slate-400">
            Edit Team
          </p>
          <h1 className="mt-4 text-4xl font-bold text-white md:text-5xl">
            팀 수정
          </h1>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4">
            <p className="text-base font-semibold text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="teamName"
              className="mb-2 block text-sm font-semibold text-slate-300"
            >
              팀 이름 <span className="text-red-400">*</span>
            </label>
            <input
              id="teamName"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="팀 이름을 입력하세요"
              className="w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              required
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              htmlFor="teamDescription"
              className="mb-2 block text-sm font-semibold text-slate-300"
            >
              팀 설명 <span className="text-red-400">*</span>
            </label>
            <textarea
              id="teamDescription"
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              placeholder="팀에 대한 상세 설명을 입력하세요"
              rows={6}
              className="w-full resize-none rounded-xl border border-white/10 bg-slate-900/60 p-4 text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <Link
              href={`/teams/${teamId}`}
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
            >
              취소
            </Link>
            <button
              type="submit"
              disabled={
                isSubmitting || !teamName.trim() || !teamDescription.trim()
              }
              className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "수정 중..." : "팀 수정"}
            </button>
          </div>
        </form>
      </section>
    </TeamsPageLayout>
  );
}
