"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTeam } from "@/services/teamService";

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
        session.user.accessToken,
      );

      // 생성 성공 시 팀 목록 페이지로 리다이렉트
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
    <div
      className="relative min-h-screen overflow-hidden text-slate-100"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(79,70,229,0.15), transparent 50%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.1), transparent 50%), rgb(2,6,23)",
      }}
    >
      <main className="relative z-10 mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-24 pt-16 sm:px-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <Link
            href="/teams"
            className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
          >
            ← 팀 목록으로 돌아가기
          </Link>
        </div>

        {/* 팀 생성 폼 */}
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.6em] text-slate-400">
              New Team
            </p>
            <h1 className="mt-4 text-4xl font-bold text-white md:text-5xl">
              새 팀 생성
            </h1>
          </div>

          {error && (
            <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-4">
              <p className="text-base font-semibold text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 팀 이름 */}
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

            {/* 팀 설명 */}
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

            {/* 버튼 */}
            <div className="flex justify-end gap-4 pt-4">
              <Link
                href="/teams"
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
              >
                취소
              </Link>
              <button
                type="submit"
                disabled={isSubmitting || !teamName.trim() || !teamDescription.trim()}
                className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "생성 중..." : "팀 생성"}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
