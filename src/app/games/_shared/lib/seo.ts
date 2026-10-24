import type { Metadata } from 'next';
import { SITE_CONFIG } from '@/app/config/siteConfig';

/**
 * 게임 페이지 검색·공유 메타 (title·description·canonical·OG·twitter)
 * 하위 세그먼트의 openGraph는 상위를 통째로 대체한다 — url·siteName·이미지를 여기서 다시 넣는다
 * canonical을 페이지마다 명시한다: 생략하면 가장 가까운 layout의 canonical(/games 등)을 물려받아 다른 페이지의 중복으로 보인다
 */

/**
 * 사이트 기본 미리보기 이미지 (app/opengraph-image.tsx)
 * 이 경로는 1년 immutable 캐시로 나간다 — app/opengraph-image.tsx 디자인을 바꾸면 v를 올려 공유 미리보기 캐시를 끊는다
 */
export const DEFAULT_OG_IMAGE = { url: '/opengraph-image?v=1', width: 1200, height: 630, alt: SITE_CONFIG.name };

export function gamePageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: SITE_CONFIG.locale,
      siteName: SITE_CONFIG.name,
      url: path,
      title: `${title} | ${SITE_CONFIG.name}`,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [DEFAULT_OG_IMAGE.url] },
  };
}

const absoluteUrl = (path: string) => `${SITE_CONFIG.url}${path}`;

/** 게임 페이지 구조화 데이터 — 브라우저에서 바로 하는 무료 게임 */
export function videoGameJsonLd({ name, description, path, genre }: { name: string; description: string; path: string; genre: string[] }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name,
    description,
    url: absoluteUrl(path),
    genre,
    inLanguage: 'ko',
    gamePlatform: '웹 브라우저',
    applicationCategory: 'GameApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW' },
  };
}

/** 게임 목록 구조화 데이터 */
export function gameListJsonLd(games: readonly { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: games.map((game, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: game.name,
      url: absoluteUrl(game.path),
    })),
  };
}
