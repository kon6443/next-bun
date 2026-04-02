'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { RIVER_MAP } from '../data/maps';
import { RIVER_FISH } from '../data/fish';

const GameCanvas = dynamic(() => import('../components/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-slate-900">
      <p className="text-slate-500 text-sm">게임 로딩 중...</p>
    </div>
  ),
});

export default function FishingPage() {
  return (
    <div className="w-full h-full bg-slate-900">
      {/* 뒤로가기 버튼 */}
      <div className="absolute top-3 left-3 z-40">
        <Link
          href="/"
          className="bg-slate-900/70 border border-slate-700/50 rounded-xl px-3 py-1.5
                     text-slate-400 hover:text-slate-200 text-xs transition-colors"
        >
          ← 나가기
        </Link>
      </div>

      <GameCanvas map={RIVER_MAP} fishPool={RIVER_FISH} />
    </div>
  );
}
