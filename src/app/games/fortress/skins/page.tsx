import type { Metadata } from "next";
import { FortressSkinsView } from "./FortressSkinsView";

export const metadata: Metadata = {
  title: "포트리스 탱크 스킨",
  description: "포트리스 탱크 스킨 4종을 미리 보고, 로그인하면 장착하고 포인트로 강화하세요.",
  robots: { index: false, follow: false },
};

/** 탱크 스킨 (F7) — noindex: 스킨 그림은 캔버스, 장착·강화는 로그인 뒤 클라이언트 조회라 서버 HTML이 얇다(디펜스 도감과 같은 판단) */
export default function FortressSkinsPage() {
  return <FortressSkinsView />;
}
