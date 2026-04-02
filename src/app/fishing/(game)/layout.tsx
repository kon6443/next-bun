import type { Viewport } from 'next';
import { FishingSocketWrapper } from '../contexts/FishingSocketWrapper';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function GameLayout({
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
