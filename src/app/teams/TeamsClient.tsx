"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import LoginButton from "./LoginButton";

type TeamSummary = {
  teamId: number;
  name: string;
  description: string;
  role: string;
};

type TeamsClientProps = {
  session: Session | null;
  initialTeams: TeamSummary[];
  error: string | null;
  isLoading?: boolean;
};

export default function TeamsClient({
  session,
  initialTeams,
  error,
  isLoading = false,
}: TeamsClientProps) {
  const isAuthenticated = !!session;

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10 px-4 pb-24 pt-12 sm:pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-8 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.7em] text-slate-400">
            Teams
          </p>
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">
                내가 속한 팀
              </h1>
              <p className="mt-3 text-sm text-slate-400">
                {isAuthenticated
                  ? `${session?.user?.name ?? "사용자"}님이 참여 중인 팀 목록이에요.`
                  : "로그인하면 내가 속한 팀 목록을 확인할 수 있어요."}
              </p>
            </div>
            {isAuthenticated ? (
              <Link
                href="/teams/new"
                className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110"
              >
                + 팀 생성
              </Link>
            ) : (
              <LoginButton />
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-8 backdrop-blur-xl">
          {isLoading ? (
            <div className="rounded-2xl border border-dashed border-white/20 px-6 py-14 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-400 border-t-transparent" />
              <p className="mt-4 text-base font-semibold text-white">
                팀 목록을 불러오는 중...
              </p>
            </div>
          ) : isAuthenticated ? (
            error ? (
              <div className="rounded-2xl border border-dashed border-red-500/20 px-6 py-14 text-center">
                <p className="text-base font-semibold text-red-400">
                  오류가 발생했습니다
                </p>
                <p className="mt-2 text-sm text-slate-400">{error}</p>
              </div>
            ) : initialTeams.length ? (
              <div className="grid gap-4 sm:gap-5 sm:grid-cols-2">
                {initialTeams.map((team) => (
                  <Link
                    key={team.teamId}
                    href={`/teams/${team.teamId}`}
                    className="group flex flex-col rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:p-5 shadow-[0_20px_40px_rgba(2,6,23,0.55)] transition hover:border-white/30"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                        {team.role}
                      </p>
                    </div>
                    <h2 className="mt-3 text-xl sm:text-2xl font-semibold text-white">
                      {team.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {team.description}
                    </p>
                    <span className="mt-6 inline-flex items-center text-sm font-semibold text-sky-300">
                      팀 보드 열기 →
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/20 px-6 py-14 text-center text-slate-400">
                <p className="text-base font-semibold text-white">
                  아직 가입된 팀이 없습니다.
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  새로운 팀을 생성하거나 초대를 기다려보세요.
                </p>
                <Link
                  href="/teams/new"
                  className="mt-6 inline-block rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-xs sm:px-5 sm:text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110"
                >
                  + 팀 생성하기
                </Link>
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-white/20 px-6 py-14 text-center">
              <p className="text-base font-semibold text-white">
                팀 목록을 보려면 로그인해 주세요.
              </p>
              <p className="mt-2 text-sm text-slate-400">
                로그인하지 않은 상태에서는 팀 목록이 비어 있습니다.
              </p>
              <LoginButton variant="primary" size="sm" className="mt-6" />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
