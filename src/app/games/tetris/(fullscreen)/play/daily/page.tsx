import type { Metadata } from "next";
import TetrisPlay from "../TetrisPlay";

export const metadata: Metadata = {
  title: "오늘의 테트리스",
  description: "오늘은 모두 같은 블록 순서 — 하루 한 번 같은 판으로 겨루고 결과를 공유하세요.",
  robots: { index: false, follow: false },
};

/** 오늘의 테트리스 (games-growth B1) — 같은 플레이 화면을 데일리 세션으로 */
export default function TetrisDailyPage() {
  return <TetrisPlay daily />;
}
