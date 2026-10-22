import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DefensePlay from "../../../../components/DefensePlay";
import { parseBoardKey, randomSeed } from "../../../../lib/campaign";

export const metadata: Metadata = {
  title: "타워 디펜스 플레이",
  robots: { index: false, follow: false },
};

type PlayPageProps = {
  params: Promise<{ boardKey: string }>;
  searchParams: Promise<{ seed?: string }>;
};

/** 1 이상 2³¹ 미만 정수만 — 그 밖은 무시하고 무작위 */
function parseSeed(raw: string | undefined): number | null {
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const seed = Number(raw);
  return seed >= 1 && seed < 2 ** 31 ? seed : null;
}

/**
 * 캠페인 플레이 (보드 키 = 스테이지 id + 난이도 접미사, 예: s1 · s1-easy · s1-hard)
 * ?seed=n 이면 그 seed로 고정(다시 하기도 같은 판 — 자동 검증·재현용), 없으면 무작위
 */
export default async function DefensePlayPage({ params, searchParams }: PlayPageProps) {
  const { boardKey } = await params;
  if (!parseBoardKey(boardKey)) notFound();
  const fixed = parseSeed((await searchParams).seed);
  return <DefensePlay boardKey={boardKey} seed={fixed ?? randomSeed()} fixedSeed={fixed !== null} />;
}
