import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFortressMatchSummary } from "@/services/gameServerService";
import { isFortressMatchId } from "@/services/fortressService";
import { buildFortressMetadata } from "../../../../battle-ui/lib/fortressShare";
import { FortressMatchViewer } from "../../../../battle-ui/components/FortressMatchViewer";

type FortressMatchPageProps = {
  params: Promise<{ matchId: string }>;
};

/** 링크 미리보기(카톡·메신저) — 경기 요약으로 제목·설명·고정 og:image (noindex) */
export async function generateMetadata({ params }: FortressMatchPageProps): Promise<Metadata> {
  const { matchId } = await params;
  const match = isFortressMatchId(matchId) ? await getFortressMatchSummary(matchId) : null;
  return buildFortressMetadata(matchId, match);
}

/**
 * 저장된 포트리스 경기 (F6) — 결과표 + 다시 보기 + 공유. 비로그인 열람, 소켓을 열지 않는다
 * (로비·방의 소켓 layout은 (live) group에만 있다)
 */
export default async function FortressMatchPage({ params }: FortressMatchPageProps) {
  const { matchId } = await params;
  // 형식이 아니면 백엔드에 묻지 않고 404. 백엔드 404(숨김·저장 전)는 화면 안 안내
  if (!isFortressMatchId(matchId)) notFound();
  return <FortressMatchViewer key={matchId} matchId={matchId} />;
}
