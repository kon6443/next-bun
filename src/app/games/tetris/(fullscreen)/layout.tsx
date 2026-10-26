import type { Viewport } from "next";
import { FULLSCREEN_GAME_VIEWPORT } from "@/app/games/_shared/components/FullscreenGameLayout";
import { TetrisGameSurface } from "../components/TetrisGameSurface";

// 플레이·리플레이 화면 — 줌·당겨서 새로고침을 막고 노치 영역까지 쓴다 (하단 내비는 BottomNavBar가 경로로 숨긴다)
// 표면은 FullscreenGameLayout과 같은 GameSurface에 보는 사람의 배경 스킨을 입힌다
export const viewport: Viewport = FULLSCREEN_GAME_VIEWPORT;

export default function TetrisFullscreenLayout({ children }: { children: React.ReactNode }) {
  return <TetrisGameSurface>{children}</TetrisGameSurface>;
}
