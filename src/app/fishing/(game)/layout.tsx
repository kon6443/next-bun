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
    // 하단 내비는 BottomNavBar가 경로(isFullscreenGamePath)로 숨긴다
    <div className="fixed inset-0 bg-slate-950 overflow-hidden">
      <FishingSocketWrapper>
        {children}
      </FishingSocketWrapper>
    </div>
  );
}
