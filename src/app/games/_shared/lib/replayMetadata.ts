import type { Metadata } from 'next';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import type { ScoreSummary } from '@/types/game';
import { OG_SIZE } from './replayCard';
import type { ReplayShareSpec } from './shareSpec';

/**
 * 리플레이 링크 미리보기(카톡·메신저) 메타 — 기록 요약으로 제목·설명을 만든다
 * og:image는 group 밖 고정 경로(/replays/{id}/og)를 명시한다 — 페이지 폴더에 opengraph-image를 두면 경로에 해시 접미사가 붙어
 * 카카오 피드 카드에 넣을 URL이 고정되지 않는다
 * 조회 실패(없음·숨김·네트워크)는 일반 미리보기로 폴백한다 — notFound()를 쓰지 않는다(크롤러 캐시에 404가 남지 않게)
 * 검색 노출은 계속 막는다(noindex) — 미리보기 카드에는 영향이 없다
 *
 * @param rawScoreId 경로 그대로의 scoreId (canonical·이미지 경로에 쓴다)
 */
export function buildReplayMetadata<D>(
  spec: ReplayShareSpec<D>,
  rawScoreId: string,
  summary: ScoreSummary<D> | null,
): Metadata {
  const path = spec.replayPath(rawScoreId);
  const base: Metadata = {
    robots: { index: false, follow: false },
    alternates: { canonical: path },
  };
  // 하위 세그먼트의 openGraph는 루트를 통째로 대체한다 — siteName·이미지를 여기서 다시 넣는다
  const image = { url: spec.imagePath(rawScoreId), ...OG_SIZE, alt: spec.fallback.title };
  const ogCommon = { url: path, type: 'website' as const, locale: SITE_CONFIG.locale, siteName: SITE_CONFIG.name, images: [image] };

  if (!summary) {
    const title = spec.fallback.title;
    const description = spec.fallback.description;
    return {
      ...base,
      title,
      description,
      openGraph: { ...ogCommon, title: `${title} | ${SITE_CONFIG.name}`, description },
      twitter: { card: 'summary_large_image', title, description, images: [image.url] },
    };
  }

  const title = `${spec.headline(summary)} | 리플레이`;
  const description = spec.metaDescription(summary);
  return {
    ...base,
    title,
    description,
    openGraph: { ...ogCommon, title: `${title} | ${SITE_CONFIG.name}`, description },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
