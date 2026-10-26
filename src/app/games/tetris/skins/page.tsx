import type { Metadata } from "next";
import { gamePageMetadata } from "@/app/games/_shared/lib/seo";
import SkinsCatalogView from "./SkinsCatalogView";

export const metadata: Metadata = gamePageMetadata({
  title: "테트리스 스킨 도감 — 블록·연출·판·배경 스킨",
  description: "온라인 테트리스의 모든 스킨과 얻는 방법. 게임보이·네온·고대비 스킨을 미리 보고 바로 장착하세요.",
  path: "/games/tetris/skins",
});

export default function TetrisSkinsPage() {
  return <SkinsCatalogView />;
}
