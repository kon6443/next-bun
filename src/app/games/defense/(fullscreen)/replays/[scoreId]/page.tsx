import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildReplayMetadata } from "@/app/games/_shared/lib/replayMetadata";
import { parseScoreId } from "@/app/games/_shared/lib/share";
import { getGameScoreSummary } from "@/services/gameServerService";
import { DefenseServerReplay } from "../../../components/DefenseServerReplay";
import { DEFENSE_SHARE } from "../../../lib/defenseShare";

type PageProps = { params: Promise<{ scoreId: string }> };

/** 링크 미리보기(카톡·메신저) — 기록 요약으로 제목·설명·고정 og:image (규칙은 buildReplayMetadata, robots noindex) */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { scoreId } = await params;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("defense", id);
  return buildReplayMetadata(DEFENSE_SHARE, scoreId, summary);
}

/** 랭킹 기록 리플레이 — 주간 보드 기록은 서버가 주 종료 4시간(세션 TTL) 뒤까지 404(D-027·D-032) */
export default async function DefenseReplayPage({ params }: PageProps) {
  const id = parseScoreId((await params).scoreId);
  if (id === null) notFound();
  return <DefenseServerReplay scoreId={id} />;
}
