import { TeamsPageLayout, SectionLabel, ButtonLink } from "./teams/components";
import { cardStyles } from "@/styles/teams";

const baseDomain = process.env.NEXT_PUBLIC_DOMAIN?.replace(/\/$/, "") ?? "";

const timeMeasurementPath = "/time-measurement";
const timeMeasurementHref = baseDomain
  ? `${baseDomain}${timeMeasurementPath}`
  : timeMeasurementPath;

const teamsPath = "/teams";
const teamsHref = baseDomain ? `${baseDomain}${teamsPath}` : teamsPath;

export default function Home() {
  return (
    <TeamsPageLayout>
      <div className="flex flex-col gap-6">
        {/* Time Tracker 섹션 */}
        <section className={`${cardStyles.section} p-4 text-center`}>
          <SectionLabel>Time Tracker</SectionLabel>
          <p className="mt-2 text-sm text-slate-400">시간 측정 및 기록</p>
          <div className="mt-6">
            <ButtonLink href={timeMeasurementHref} fullWidth>
              바로가기
            </ButtonLink>
          </div>
        </section>

        {/* Teams 섹션 */}
        <section className={`${cardStyles.section} p-4 text-center`}>
          <SectionLabel>Teams</SectionLabel>
          <p className="mt-2 text-sm text-slate-400">팀 협업 및 태스크 관리</p>
          <div className="mt-6">
            <ButtonLink href={teamsHref} fullWidth>
              팀 보드 열기
            </ButtonLink>
          </div>
        </section>
      </div>
    </TeamsPageLayout>
  );
}
