import { TeamsPageLayout, SectionLabel, ButtonLink } from "./teams/components";
import { cardStyles } from "@/styles/teams";
import { SITE_CONFIG } from "./config/siteConfig";

const baseDomain = process.env.NEXT_PUBLIC_DOMAIN?.replace(/\/$/, "") ?? "";

const siteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_CONFIG.name,
  url: SITE_CONFIG.url,
  description: SITE_CONFIG.description,
};

const timeMeasurementPath = "/time-measurement";
const timeMeasurementHref = baseDomain
  ? `${baseDomain}${timeMeasurementPath}`
  : timeMeasurementPath;

const teamsPath = "/teams";
const teamsHref = baseDomain ? `${baseDomain}${teamsPath}` : teamsPath;

const fishingPath = "/fishing";
const fishingHref = baseDomain ? `${baseDomain}${fishingPath}` : fishingPath;

export default function Home() {
  return (
    <TeamsPageLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
      />
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
        {/* 낚시 게임 섹션 */}
        <section className={`${cardStyles.section} p-4 text-center`}>
          <SectionLabel>Fishing Game</SectionLabel>
          <p className="mt-2 text-sm text-slate-400">방치형 낚시 미니게임</p>
          <div className="mt-6">
            <ButtonLink href={fishingHref} fullWidth>
              🎣 낚시하러 가기
            </ButtonLink>
          </div>
        </section>
      </div>
    </TeamsPageLayout>
  );
}
