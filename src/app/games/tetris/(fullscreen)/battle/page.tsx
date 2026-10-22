import type { Metadata } from "next";
import { BattleLobby } from "../../battle-ui/components/BattleLobby";

export const metadata: Metadata = {
  title: "테트리스 대전",
  description: "친구와 2~4명이 같은 블록으로 겨루는 테트리스 대전 — 방을 만들고 링크로 초대하세요.",
  robots: { index: false, follow: false },
};

export default function TetrisBattleLobbyPage() {
  return <BattleLobby />;
}
