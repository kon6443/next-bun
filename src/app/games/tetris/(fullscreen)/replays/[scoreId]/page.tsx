import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGameScoreSummary } from "@/services/gameServerService";
import { parseScoreId } from "@/app/games/_shared/lib/share";
import { buildReplayMetadata } from "@/app/games/_shared/lib/replayMetadata";
import { TETRIS_SHARE } from "../../../lib/share";
import ReplayPlayer from "./ReplayPlayer";

type ReplayPageProps = {
  params: Promise<{ scoreId: string }>;
};

/** 링크 미리보기(카톡·메신저) — 기록 요약으로 제목·설명·고정 og:image (규칙은 buildReplayMetadata) */
export async function generateMetadata({ params }: ReplayPageProps): Promise<Metadata> {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("tetris", id);
  return buildReplayMetadata(TETRIS_SHARE, scoreId, summary);
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { scoreId } = await params;
  // 양의 정수가 아니면 백엔드에 묻지 않고 404
  const id = parseScoreId(scoreId);
  if (id === null) notFound();
  return <ReplayPlayer scoreId={id} />;
}
