import type { Viewport } from "next";

/** 플레이·리플레이 화면 viewport — 줌·당겨서 새로고침을 막고 노치 영역까지 쓴다 (게임별 (fullscreen)/layout.tsx가 export한다) */
export const FULLSCREEN_GAME_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/** 전체화면 게임 틀 — 하단 내비는 BottomNavBar가 경로(isFullscreenGamePath)로 숨긴다 */
export function FullscreenGameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-slate-950 text-slate-100" style={{ touchAction: "none" }}>
      {children}
    </div>
  );
}
