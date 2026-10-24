import type { Viewport } from "next";
import { GameSurface } from "./GameSurface";

/** 플레이·리플레이 화면 viewport — 줌·당겨서 새로고침을 막고 노치 영역까지 쓴다 (게임별 (fullscreen)/layout.tsx가 export한다) */
export const FULLSCREEN_GAME_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * 전체화면 게임 틀 — 하단 내비는 BottomNavBar가 경로(isFullscreenGamePath)로 숨긴다
 * 길게 누르기 선택·복사 메뉴는 GameSurface가 막는다(입력칸은 예외). 이 파일은 viewport 상수를 서버 layout에 넘겨야 해서 서버 모듈로 둔다
 */
export function FullscreenGameLayout({ children }: { children: React.ReactNode }) {
  return <GameSurface>{children}</GameSurface>;
}
