import Link from 'next/link';

export default function TeamsPromoBanner() {
  return (
    <section className="mt-12 rounded-2xl border border-indigo-500/20 bg-indigo-900/15 p-6">
      <h2 className="text-lg font-semibold">팀 협업도 함께 해보세요</h2>
      <p className="mt-1 text-sm text-slate-400">
        칸반 보드, 실시간 태스크 관리, 팀원 초대까지.
        팀 프로젝트를 한곳에서 관리하세요.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/teams"
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          팀 보드 시작하기
        </Link>
        <Link
          href="/fishing"
          className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm transition-colors hover:border-slate-500"
        >
          낚시 게임으로 돌아가기
        </Link>
      </div>
    </section>
  );
}
