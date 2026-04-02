import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from './config/siteConfig';
import { RIVER_FISH } from './fishing/data/fish';

export default function sitemap(): MetadataRoute.Sitemap {
  const fishPages: MetadataRoute.Sitemap = RIVER_FISH.map((fish) => ({
    url: `${SITE_CONFIG.url}/fishing/guide/${encodeURIComponent(fish.id)}`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  return [
    {
      url: SITE_CONFIG.url,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${SITE_CONFIG.url}/fishing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_CONFIG.url}/fishing/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_CONFIG.url}/fishing/guide`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...fishPages,
    {
      url: `${SITE_CONFIG.url}/time-measurement`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
