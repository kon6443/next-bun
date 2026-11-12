import type { Metadata } from "next";
import FortressPrototype from "../../components/FortressPrototype";

export const metadata: Metadata = {
  title: "포트리스 플레이",
  robots: { index: false, follow: false },
};

/** 포트리스 설정·경기 (F1·F2) — noindex(캔버스 플레이 화면 — 테트리스 플레이와 같다). 홈(/games/fortress)의 진입 ?vs=ai|local로 구성을 미리 채운다 · ?seed=n 고정 · ?auto=1 AI 4인 자동 · ?perf=1 실측 표시 */
export default function FortressPlayPage() {
  return <FortressPrototype />;
}
