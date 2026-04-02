import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from './config/siteConfig';
import { RIVER_FISH } from './fishing/data/fish';

/** 빌드 시점 고정 — 콘텐츠 실제 변경 시에만 날짜를 갱신할 것 */
const LAST_UPDATED = '2026-04-02';

export default function sitemap(): MetadataRoute.Sitemap {
  const fishPages: MetadataRoute.Sitemap = RIVER_FISH.map((fish) => ({
    url: `${SITE_CONFIG.url}/fishing/guide/${encodeURIComponent(fish.id)}`,
    lastModified: LAST_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [
    {
      url: SITE_CONFIG.url,
      lastModified: LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${SITE_CONFIG.url}/fishing`,
      lastModified: LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_CONFIG.url}/fishing/about`,
      lastModified: LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_CONFIG.url}/fishing/guide`,
      lastModified: LAST_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...fishPages,
    {
      url: `${SITE_CONFIG.url}/time-measurement`,
      lastModified: LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
