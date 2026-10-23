import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DefensePlay from "../../../../components/DefensePlay";
import { parseBoardKey, parseSeedParam, randomSeed } from "../../../../lib/campaign";

export const metadata: Metadata = {
  title: "타워 디펜스 플레이",
  robots: { index: false, follow: false },
};

type PlayPageProps = {
  params: Promise<{ boardKey: string }>;
  searchParams: Promise<{ seed?: string }>;
};

/**
 * 캠페인 플레이 (보드 키 = 스테이지 id + 난이도 접미사, 예: s1 · s1-easy · s1-hard)
 * ?seed=n 이면 그 seed로 고정(다시 하기도 같은 판 — 자동 검증·재현용), 없으면 무작위
 */
export default async function DefensePlayPage({ params, searchParams }: PlayPageProps) {
  const { boardKey } = await params;
  if (!parseBoardKey(boardKey)) notFound();
  const fixed = parseSeedParam((await searchParams).seed);
  return <DefensePlay boardKey={boardKey} seed={fixed ?? randomSeed()} fixedSeed={fixed !== null} />;
}
