import { TeamsPageLayout, LoadingSpinner, SectionLabel } from "../components";
import { cardStyles } from "@/styles/teams";

export default function TeamDetailLoading() {
  return (
    <TeamsPageLayout maxWidth="6xl">
      <section className={`${cardStyles.section} p-4 sm:p-8`}>
        <SectionLabel>Team Kanban</SectionLabel>
        <div className="mt-4">
          <div className="h-12 w-48 animate-pulse rounded-lg bg-slate-800" />
        </div>
      </section>

      <section className={`${cardStyles.section} p-4 sm:p-8`}>
        <LoadingSpinner message="팀 정보를 불러오는 중..." />
      </section>
    </TeamsPageLayout>
  );
}
