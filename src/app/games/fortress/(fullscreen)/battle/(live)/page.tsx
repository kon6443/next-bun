import type { Metadata } from "next";
import { FortressLobby } from "../../../battle-ui/components/FortressLobby";

export const metadata: Metadata = {
  title: "포트리스 대전",
  description: "친구와 2~4명이 겨루는 포트리스 온라인 대전 — 방을 만들고 링크로 초대하세요.",
  robots: { index: false, follow: false },
};

/** 포트리스 대전 로비(F5) — noindex: 방 목록은 클라이언트 소켓 화면이라 서버 HTML이 얇다(테트리스 대전 로비와 같다 — games-growth D-011). 검색은 홈(/games/fortress)으로 */
export default function FortressBattleLobbyPage() {
  return <FortressLobby />;
}
