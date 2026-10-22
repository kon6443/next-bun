import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BattlePreview } from "../../../battle-ui/components/BattlePreview";

export const metadata: Metadata = {
  title: "테트리스 대전 미리보기",
  robots: { index: false, follow: false },
};

type BattlePreviewPageProps = {
  searchParams: Promise<{ n?: string; seed?: string }>;
};

/** 개발 전용 — 서버 매치(P2) 전에 대전 화면을 가짜 상대로 확인한다. 운영 빌드에서는 404 */
export default async function TetrisBattlePreviewPage({ searchParams }: BattlePreviewPageProps) {
  if (process.env.NODE_ENV === "production") notFound();
  const { n, seed } = await searchParams;
  const count = Math.min(3, Math.max(1, Number.parseInt(n ?? "3", 10) || 3));
  const parsedSeed = Number.parseInt(seed ?? "", 10);
  return <BattlePreview opponentCount={count} seed={Number.isInteger(parsedSeed) ? parsedSeed >>> 0 : 20261022} />;
}
