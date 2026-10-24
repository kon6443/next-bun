import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from './config/siteConfig';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/games', '/fishing', '/teams'],
        // 게임: 개발용 측정 화면만 막는다(운영은 404). 로컬 다시보기·플레이·리플레이는 noindex 메타 — 막으면 크롤러가 noindex를 못 읽는다
        disallow: ['/teams/', '/mypage', '/feedback', '/auth', '/api', '/games/defense/dev'],
      },
    ],
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
  };
}
