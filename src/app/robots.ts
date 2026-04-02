import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from './config/siteConfig';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/fishing'],
        disallow: ['/teams', '/mypage', '/auth', '/api'],
      },
    ],
    sitemap: `${SITE_CONFIG.url}/sitemap.xml`,
  };
}
