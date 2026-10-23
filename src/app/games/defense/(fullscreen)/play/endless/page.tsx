import type { Metadata } from "next";
import RankedPlay from "../../../components/RankedPlay";
import { parseSeedParam } from "../../../lib/campaign";

export const metadata: Metadata = {
  title: "타워 디펜스 무한 모드",
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<{ seed?: string }> };

/** 타워 디펜스 무한 모드 — ?seed=n 이면 로컬 판 seed 고정(자동 검증·재현용) */
export default async function DefenseEndlessPage({ searchParams }: PageProps) {
  return <RankedPlay mode="endless" fixedSeed={parseSeedParam((await searchParams).seed)} />;
}
