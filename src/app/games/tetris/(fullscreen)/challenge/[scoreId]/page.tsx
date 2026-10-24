import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGameScoreSummary } from "@/services/gameServerService";
import { parseScoreId } from "@/app/games/_shared/lib/share";
import TetrisPlay from "../../play/TetrisPlay";
import { buildChallengeMetadata } from "../../../lib/challenge";

type ChallengePageProps = {
  params: Promise<{ scoreId: string }>;
};

/** 링크 미리보기(카톡·메신저) — "○○님의 12,340점에 도전!" + 도전장 카드 */
export async function generateMetadata({ params }: ChallengePageProps): Promise<Metadata> {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("tetris", id);
  return buildChallengeMetadata(scoreId, summary);
}

/** 테트리스 도전장 (games-growth B2) — 원본 기록과 같은 seed로 한 판 */
export default async function TetrisChallengePage({ params }: ChallengePageProps) {
  const id = parseScoreId((await params).scoreId);
  if (id === null) notFound();
  return <TetrisPlay challengeScoreId={id} />;
}
