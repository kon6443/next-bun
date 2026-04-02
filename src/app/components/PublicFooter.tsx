import Link from 'next/link';
import { SITE_CONFIG } from '../config/siteConfig';

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 px-4 py-8 text-sm text-slate-500">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4">
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
          <Link href="/" className="hover:text-slate-300 transition-colors">홈</Link>
          <Link href="/fishing" className="hover:text-slate-300 transition-colors">낚시 게임</Link>
          <Link href="/fishing/guide" className="hover:text-slate-300 transition-colors">낚시 도감</Link>
          <Link href="/fishing/about" className="hover:text-slate-300 transition-colors">게임 소개</Link>
          <Link href="/teams" className="hover:text-slate-300 transition-colors">팀 협업</Link>
          <Link href="/time-measurement" className="hover:text-slate-300 transition-colors">시간 측정</Link>
        </nav>
        <p>&copy; {new Date().getFullYear()} {SITE_CONFIG.name}</p>
      </div>
    </footer>
  );
}
