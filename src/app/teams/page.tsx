"use client";

import Link from "next/link";
import { useSession, signIn } from "next-auth/react";

type TeamSummary = {
  teamId: number;
  name: string;
  description: string;
  role: string;
  memberCount: number;
};

const MOCK_TEAMS: TeamSummary[] = [
  {
    teamId: 101,
    name: "Design Lab",
    description: "프로덕트 경험과 브랜딩을 담당하는 디자이너 그룹",
    role: "디자인",
    memberCount: 8,
  },
  {
    teamId: 205,
    name: "Planet Core",
    description: "서비스 핵심 로직과 API를 관리하는 백엔드 팀",
    role: "백엔드",
    memberCount: 12,
  },
  {
    teamId: 318,
    name: "Momentum",
    description: "실험과 성장 지표를 담당하는 Growth 스쿼드",
    role: "Growth",
    memberCount: 6,
  },
];

export default function TeamsPage() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const teams = isAuthenticated ? MOCK_TEAMS : [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-24 pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
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
            {!isAuthenticated && (
              <button
                onClick={() => signIn("kakao")}
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-white/40"
              >
                로그인하기
              </button>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl">
          {isAuthenticated ? (
            teams.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {teams.map((team) => (
                  <Link
                    key={team.teamId}
                    href={`/teams/${team.teamId}`}
                    className="group flex flex-col rounded-2xl border border-white/10 bg-slate-950/40 p-5 shadow-[0_20px_40px_rgba(2,6,23,0.55)] transition hover:border-white/30"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-[0.4em] text-slate-500">
                        {team.role}
                      </p>
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
                        {team.memberCount}명
                      </span>
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-white">
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
                아직 가입된 팀이 없습니다. 초대를 기다리거나 관리자에게 문의하세요.
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
              <button
                onClick={() => signIn("kakao")}
                className="mt-6 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110"
              >
                로그인하고 확인하기
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

