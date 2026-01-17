export default function TeamDetailLoading() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* 배경 효과 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-72 w-72 rounded-full bg-indigo-600/30 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 sm:gap-10 px-4 pb-24 pt-12 sm:pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-8 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.6em] text-slate-400">Team Kanban</p>
          <div className="mt-4">
            <div className="h-12 w-48 animate-pulse rounded-lg bg-slate-800" />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-8 backdrop-blur-xl">
          <div className="rounded-2xl border border-dashed border-white/20 px-6 py-14 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-400 border-t-transparent" />
            <p className="mt-4 text-base font-semibold text-white">팀 정보를 불러오는 중...</p>
          </div>
        </section>
      </main>
    </div>
  );
}
