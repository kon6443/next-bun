"use client";

import { useEffect } from "react";
import Link from "next/link";

type ErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("Teams page error:", error);
  }, [error]);

  return (
    <div
      className="relative min-h-screen overflow-hidden text-slate-100"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(79,70,229,0.15), transparent 50%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.1), transparent 50%), rgb(2,6,23)",
      }}
    >
      <main className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 sm:gap-10 px-4 pb-24 pt-12 sm:pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-8">
          <p className="text-xs uppercase tracking-[0.7em] text-slate-400">
            Teams
          </p>
          <div className="mt-4">
            <h1 className="text-3xl font-bold text-white sm:text-4xl">
              오류가 발생했습니다
            </h1>
          </div>
        </section>

        <section className="rounded-3xl border border-red-500/20 bg-red-900/50 p-4 sm:p-8">
          <div className="rounded-2xl border border-dashed border-red-500/20 px-6 py-14 text-center">
            <p className="text-base font-semibold text-red-400">
              오류가 발생했습니다
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {error.message || "팀 목록을 불러오는 중 문제가 발생했습니다."}
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={reset}
                className="rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2 text-xs sm:px-5 sm:text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110"
              >
                다시 시도
              </button>
              <Link
                href="/"
                className="rounded-full border border-white/20 px-4 py-2 text-xs sm:px-5 sm:text-sm font-semibold text-slate-200 transition hover:border-white/40"
              >
                홈으로 돌아가기
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
