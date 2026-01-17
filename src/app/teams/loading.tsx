import { TeamsPageLayout, LoadingSpinner } from "./components";
import { cardStyles } from "@/styles/teams";

export default function TeamsLoading() {
  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-4 sm:p-8`}>
        <p className="text-xs uppercase tracking-[0.7em] text-slate-400">
          Teams
        </p>
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
