import { SectionLabel, ButtonLink } from "./teams/components";

const baseDomain =
  process.env.NEXT_PUBLIC_DOMAIN?.replace(/\/$/, "") ?? "";

const timeMeasurementPath = "/time-measurement";
const timeMeasurementHref = baseDomain
  ? `${baseDomain}${timeMeasurementPath}`
  : timeMeasurementPath;

const teamsPath = "/teams";
const teamsHref = baseDomain ? `${baseDomain}${teamsPath}` : teamsPath;

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <div className="grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        {/* Time Tracker 섹션 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_35px_80px_rgba(2,6,23,0.65)] backdrop-blur-xl">
          <SectionLabel>Time Tracker</SectionLabel>
          <p className="mt-2 text-sm text-slate-400">
            시간 측정 및 기록
          </p>
          <div className="mt-6">
            <ButtonLink href={timeMeasurementHref}>
              바로가기
            </ButtonLink>
          </div>
        </section>

        {/* Teams 섹션 */}
        <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_35px_80px_rgba(2,6,23,0.65)] backdrop-blur-xl">
          <SectionLabel>Teams</SectionLabel>
          <p className="mt-2 text-sm text-slate-400">
            팀 협업 및 태스크 관리
          </p>
          <div className="mt-6">
            <ButtonLink href={teamsHref}>
              팀 보드 열기
            </ButtonLink>
          </div>
        </section>
      </div>
    </main>
  );
}
