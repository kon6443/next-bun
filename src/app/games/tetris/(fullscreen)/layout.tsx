import type { Viewport } from "next";
import { FULLSCREEN_GAME_VIEWPORT, FullscreenGameLayout } from "@/app/games/_shared/components/FullscreenGameLayout";

// 플레이·리플레이 화면 — 줌·당겨서 새로고침을 막고 노치 영역까지 쓴다 (하단 내비는 BottomNavBar가 경로로 숨긴다)
export const viewport: Viewport = FULLSCREEN_GAME_VIEWPORT;

export default function TetrisFullscreenLayout({ children }: { children: React.ReactNode }) {
  return <FullscreenGameLayout>{children}</FullscreenGameLayout>;
}
