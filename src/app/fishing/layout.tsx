import type { Metadata } from 'next';
import { FishingSocketWrapper } from './contexts/FishingSocketWrapper';

export const metadata: Metadata = {
  title: '낚시 게임',
  description: '방치형 멀티플레이어 낚시 미니게임',
};

export default function FishingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-slate-950 overflow-hidden">
      <style>{`
        /* 낚시 게임 진입 시 BottomNavBar 숨기기 */
        nav[aria-label="주요 탐색"] {
          display: none !important;
        }
      `}</style>
      <FishingSocketWrapper>
        {children}
      </FishingSocketWrapper>
    </div>
  );
}
