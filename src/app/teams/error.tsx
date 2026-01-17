"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TeamsPageLayout } from "./components";
import { cardStyles } from "@/styles/teams";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Teams page error:", error);
  }, [error]);

  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-4 sm:p-8`}>
        <p className="text-xs uppercase tracking-[0.7em] text-slate-400">
          Teams
        </p>
        <div className="mt-4">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            오류가 발생했습니다
          </h1>
        </div>
      </section>

      <section className={`${cardStyles.errorSection} p-4 sm:p-8`}>
        <div
          className={`${cardStyles.errorDashedContainer} px-6 py-14 text-center`}
        >
          <p className="text-base font-semibold text-red-400">
            오류가 발생했습니다
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {error.message || "팀 목록을 불러오는 중 문제가 발생했습니다."}
          </p>
          <div className="mt-6 flex flex-col gap-3 justify-center sm:flex-row">
            <button
              onClick={reset}
              className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 sm:px-5 sm:text-sm"
            >
              다시 시도
            </button>
            <Link
              href="/"
              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/40 sm:px-5 sm:text-sm"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </div>
      </section>
    </TeamsPageLayout>
  );
}
