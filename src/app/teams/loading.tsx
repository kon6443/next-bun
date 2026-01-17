import { TeamsPageLayout, LoadingSpinner, SectionLabel } from "./components";
import { cardStyles } from "@/styles/teams";

export default function TeamsLoading() {
  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-4 sm:p-8`}>
        <SectionLabel spacing="wide">Teams</SectionLabel>
        <div className="mt-4">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            내가 속한 팀
          </h1>
        </div>
      </section>

      <section className={`${cardStyles.section} p-4 sm:p-8`}>
        <LoadingSpinner message="로딩 중..." />
      </section>
    </TeamsPageLayout>
  );
}
