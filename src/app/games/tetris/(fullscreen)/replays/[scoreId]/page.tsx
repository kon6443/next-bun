import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_CONFIG } from "@/app/config/siteConfig";
import { getGameScoreSummary } from "@/services/gameServerService";
import { formatFrames } from "../../../lib/format";
import { parseScoreId, replayHeadline, replayImagePath } from "../../../lib/share";
import { OG_SIZE } from "../../../lib/replayCard";
import { FRAMES_PER_SECOND } from "../../../engine";
import ReplayPlayer from "./ReplayPlayer";

type ReplayPageProps = {
  params: Promise<{ scoreId: string }>;
};

const FALLBACK_DESCRIPTION = "브라우저에서 바로 하는 테트리스 — 랭킹과 리플레이로 실력을 겨뤄 보세요.";

/**
 * 링크 미리보기(카톡·메신저) — 기록 요약으로 제목·설명을 만든다
 * og:image는 group 밖 고정 경로(/replays/{id}/og)를 명시한다 — 이 폴더에 opengraph-image를 두면 경로에 해시 접미사가 붙어
 * 카카오 피드 카드에 넣을 URL이 고정되지 않는다
 * 조회 실패(없음·숨김·네트워크)는 일반 테트리스 미리보기로 폴백한다 — notFound()를 쓰지 않는다(크롤러 캐시에 404가 남지 않게)
 * 검색 노출은 계속 막는다(noindex) — 미리보기 카드에는 영향이 없다
 */
export async function generateMetadata({ params }: ReplayPageProps): Promise<Metadata> {
  const { scoreId } = await params;
  const path = `/games/tetris/replays/${scoreId}`;
  const id = parseScoreId(scoreId);
  const summary = id === null ? null : await getGameScoreSummary("tetris", id);

  const base: Metadata = {
    robots: { index: false, follow: false },
    alternates: { canonical: path },
  };
  // 하위 세그먼트의 openGraph는 루트를 통째로 대체한다 — siteName·이미지를 여기서 다시 넣는다
  const image = { url: replayImagePath(scoreId), ...OG_SIZE, alt: "테트리스 리플레이" };
  const ogCommon = { url: path, type: "website" as const, locale: SITE_CONFIG.locale, siteName: SITE_CONFIG.name, images: [image] };

  if (!summary) {
    const title = "테트리스 리플레이";
    return {
      ...base,
      title,
      description: FALLBACK_DESCRIPTION,
      openGraph: { ...ogCommon, title: `${title} | ${SITE_CONFIG.name}`, description: FALLBACK_DESCRIPTION },
      twitter: { card: "summary_large_image", title, description: FALLBACK_DESCRIPTION, images: [image.url] },
    };
  }

  const title = `${replayHeadline(summary)} | 리플레이`;
  const time = formatFrames(Math.round((summary.durationMs * FRAMES_PER_SECOND) / 1000));
  const description = `${summary.detail.lines}줄 · 레벨 ${summary.detail.level} · ${time} · 전체 ${summary.rank}위 — 플레이를 그대로 다시 보세요.`;
  return {
    ...base,
    title,
    description,
    openGraph: { ...ogCommon, title: `${title} | ${SITE_CONFIG.name}`, description },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function ReplayPage({ params }: ReplayPageProps) {
  const { scoreId } = await params;
  // 양의 정수가 아니면 백엔드에 묻지 않고 404
  const id = parseScoreId(scoreId);
  if (id === null) notFound();
  return <ReplayPlayer scoreId={id} />;
}
