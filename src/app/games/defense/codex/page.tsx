import type { Metadata } from "next";
import Link from "next/link";
import { TeamsPageLayout } from "@/app/teams/components";
import { Codex } from "../components/Codex";

/** 도감 내용은 이 기기의 진행도로 클라이언트에서 그린다 — 서버 HTML이 비어 색인하지 않는다 */
export const metadata: Metadata = {
  title: "타워 디펜스 도감",
  description: "타워 디펜스에서 만난 적과 열린 타워를 모아 보는 도감.",
  robots: { index: false, follow: true },
};

/** 도감 (defense DESIGN §F5) — 만난 적·열린 타워·브리핑 카드 */
export default function DefenseCodexPage() {
  return (
    <TeamsPageLayout>
      <Link href="/games/defense" className="flex min-h-11 items-center text-sm text-slate-400">
        ← 캠페인 지도
      </Link>
      <h1 className="text-2xl font-bold text-white">도감</h1>
      <Codex />
      {/* 하단 내비(떠 있는 카드형 — 바닥 띄움 + 안쪽 여백으로 공통 6rem 여백보다 조금 높다)에 마지막 항목이 가리지 않게 */}
      <div aria-hidden="true" className="h-8" />
    </TeamsPageLayout>
  );
}
