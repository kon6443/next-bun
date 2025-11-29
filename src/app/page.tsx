const baseDomain =
  process.env.NEXT_PUBLIC_DOMAIN?.replace(/\/$/, "") ?? "";

const timeMeasurementPath = "/time-measurement";
const timeMeasurementHref = baseDomain
  ? `${baseDomain}${timeMeasurementPath}`
  : timeMeasurementPath;

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
      <section className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_35px_80px_rgba(2,6,23,0.65)] backdrop-blur-xl">
        <p className="text-xs uppercase tracking-[0.6em] text-slate-400">
          Time Tracker
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href={timeMeasurementHref}
            className="w-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 px-6 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 sm:w-auto"
          >
            바로가기
          </a>
        </div>
      </section>
    </main>
  );
}
