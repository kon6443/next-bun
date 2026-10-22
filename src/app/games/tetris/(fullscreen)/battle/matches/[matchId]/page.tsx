import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBattleMatchSummary } from "@/services/gameServerService";
import { isBattleMatchId } from "@/services/tetrisBattleService";
import { buildBattleMetadata } from "../../../../battle-ui/lib/battleShare";
import { BattleMatchViewer } from "../../../../battle-ui/components/BattleMatchViewer";

type BattleMatchPageProps = {
  params: Promise<{ matchId: string }>;
};

/** 링크 미리보기(카톡·메신저) — 경기 요약으로 제목·설명·고정 og:image */
export async function generateMetadata({ params }: BattleMatchPageProps): Promise<Metadata> {
  const { matchId } = await params;
  const match = isBattleMatchId(matchId) ? await getBattleMatchSummary(matchId) : null;
  return buildBattleMetadata(matchId, match);
}

/**
 * 저장된 대전 경기 — 결과표 + 2~4판 동시 재생 + 공유 (DESIGN §18). 비로그인 열람, 소켓을 열지 않는다
 * (로비·방의 소켓 layout은 (live) group에만 있다)
 */
export default async function BattleMatchPage({ params }: BattleMatchPageProps) {
  const { matchId } = await params;
  // 형식이 아니면 백엔드에 묻지 않고 404 (리플레이 페이지와 같다). 백엔드 404(숨김·저장 전)는 화면 안 안내
  if (!isBattleMatchId(matchId)) notFound();
  // 경기가 바뀌면 재생 상태(프레임·배속)를 처음부터 — 같은 인스턴스를 재사용하지 않는다
  return <BattleMatchViewer key={matchId} matchId={matchId} />;
}
