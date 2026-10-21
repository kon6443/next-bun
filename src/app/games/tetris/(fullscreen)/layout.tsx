import type { Viewport } from "next";

// 플레이·리플레이 화면 — 줌·당겨서 새로고침을 막고 노치 영역까지 쓴다 (하단 내비는 BottomNavBar가 경로로 숨긴다)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function TetrisFullscreenLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden overscroll-none bg-slate-950 text-slate-100" style={{ touchAction: "none" }}>
      {children}
    </div>
  );
}
