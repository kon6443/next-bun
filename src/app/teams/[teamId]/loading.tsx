export default function TeamDetailLoading() {
  return (
    <div
      className="relative min-h-screen overflow-hidden text-slate-100"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(79,70,229,0.15), transparent 50%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.1), transparent 50%), rgb(2,6,23)",
      }}
    >
      <main className="relative z-10 mx-auto flex max-w-6xl flex-col gap-6 sm:gap-10 px-4 pb-24 pt-12 sm:pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-8">
          <p className="text-xs uppercase tracking-[0.6em] text-slate-400">Team Kanban</p>
          <div className="mt-4">
            <div className="h-12 w-48 animate-pulse rounded-lg bg-slate-800" />
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-8">
          <div className="rounded-2xl border border-dashed border-white/20 px-6 py-14 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-slate-400 border-t-transparent" />
            <p className="mt-4 text-base font-semibold text-white">팀 정보를 불러오는 중...</p>
          </div>
        </section>
      </main>
    </div>
  );
}
