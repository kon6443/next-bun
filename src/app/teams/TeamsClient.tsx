"use client";

import Link from "next/link";
import type { Session } from "next-auth";
import { TeamsPageLayout, LoadingSpinner, ButtonLink, SectionLabel } from "./components";
import { cardStyles } from "@/styles/teams";
import type { TeamSummary } from "@/types/team";
import LoginButton from "./LoginButton";

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
    <TeamsPageLayout>
      {/* 헤더 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        <SectionLabel spacing="wide">Teams</SectionLabel>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">
              내가 속한 팀
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              {isAuthenticated
                ? `${session?.user?.name ?? "사용자"}님이 참여 중인 팀 목록이에요.`
                : "로그인하면 내가 속한 팀 목록을 확인할 수 있어요."}
            </p>
          </div>
          {isAuthenticated ? (
            <ButtonLink href="/teams/new" size="lg" fullWidth>
              + 팀 생성
            </ButtonLink>
          ) : (
            <LoginButton />
          )}
        </div>
      </section>

      {/* 팀 목록 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        {isLoading ? (
          <LoadingSpinner message="팀 목록을 불러오는 중..." />
        ) : isAuthenticated ? (
          error ? (
            <ErrorMessage message={error} />
          ) : initialTeams.length ? (
            <TeamList teams={initialTeams} />
          ) : (
            <EmptyTeamList />
          )
        ) : (
          <LoginPrompt />
        )}
      </section>
    </TeamsPageLayout>
  );
}

/** 에러 메시지 컴포넌트 */
function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      className={`${cardStyles.errorDashedContainer} px-6 py-14 text-center`}
    >
      <p className="text-base font-semibold text-red-400">오류가 발생했습니다</p>
      <p className="mt-2 text-sm text-slate-400">{message}</p>
    </div>
  );
}

/** 팀 목록 컴포넌트 */
function TeamList({ teams }: { teams: TeamSummary[] }) {
  return (
    <div className="grid gap-4">
      {teams.map((team) => (
        <Link
          key={team.teamId}
          href={`/teams/${team.teamId}`}
          className="group flex flex-col rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-[0_20px_40px_rgba(2,6,23,0.55)] transition hover:border-white/30"
        >
          <div className="flex items-center justify-between">
            <SectionLabel spacing="tight" color="subtle">
              {team.role}
            </SectionLabel>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-white">
            {team.name}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{team.description}</p>
          <span className="mt-6 inline-flex items-center text-sm font-semibold text-sky-300">
            팀 보드 열기 →
          </span>
        </Link>
      ))}
    </div>
  );
}

/** 빈 팀 목록 컴포넌트 */
function EmptyTeamList() {
  return (
    <div
      className={`${cardStyles.dashedContainer} px-6 py-14 text-center text-slate-400`}
    >
      <p className="text-base font-semibold text-white">
        아직 가입된 팀이 없습니다.
      </p>
      <p className="mt-2 text-sm text-slate-400">
        새로운 팀을 생성하거나 초대를 기다려보세요.
      </p>
      <ButtonLink href="/teams/new" size="lg" className="mt-6">
        + 팀 생성하기
      </ButtonLink>
    </div>
  );
}

/** 로그인 유도 컴포넌트 */
function LoginPrompt() {
  return (
    <div className={`${cardStyles.dashedContainer} px-6 py-14 text-center`}>
      <p className="text-base font-semibold text-white">
        팀 목록을 보려면 로그인해 주세요.
      </p>
      <p className="mt-2 text-sm text-slate-400">
        로그인하지 않은 상태에서는 팀 목록이 비어 있습니다.
      </p>
      <LoginButton variant="primary" size="sm" className="mt-6" />
    </div>
  );
}
