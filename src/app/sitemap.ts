import type { MetadataRoute } from 'next';
import { SITE_CONFIG } from './config/siteConfig';
import { RIVER_FISH } from './fishing/data/fish';
import { CAMPAIGN } from './games/defense/lib/campaign';

/** 빌드 시점 고정 — 콘텐츠 실제 변경 시에만 날짜를 갱신할 것 */
const LAST_UPDATED = '2026-04-02';
/** 게임 페이지 검색용 소개·메타 갱신일 */
const GAMES_UPDATED = '2026-10-24';

export default function sitemap(): MetadataRoute.Sitemap {
  const fishPages: MetadataRoute.Sitemap = RIVER_FISH.map((fish) => ({
    url: `${SITE_CONFIG.url}/fishing/guide/${encodeURIComponent(fish.id)}`,
    lastModified: LAST_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // 리플레이·대전 경기·플레이 화면·도감은 noindex라 넣지 않는다(얇은 캔버스·클라이언트 페이지 — games-growth D-011)
  // 최근 대전 목록(/games/tetris/battle/matches)은 서버 HTML이 비어(목록은 클라이언트 조회) 색인은 두되 제출하지 않는다
  const defenseStagePages: MetadataRoute.Sitemap = CAMPAIGN.map((stage) => ({
    url: `${SITE_CONFIG.url}/games/defense/campaign/${stage.id}`,
    lastModified: GAMES_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [
    {
      url: SITE_CONFIG.url,
      lastModified: LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 1.0,
    },
    {
      url: `${SITE_CONFIG.url}/games`,
      lastModified: GAMES_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_CONFIG.url}/games/tetris`,
      lastModified: GAMES_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_CONFIG.url}/games/tetris/rankings`,
      lastModified: GAMES_UPDATED,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${SITE_CONFIG.url}/games/defense`,
      lastModified: GAMES_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_CONFIG.url}/games/defense/rankings`,
      lastModified: GAMES_UPDATED,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    ...defenseStagePages,
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
      url: `${SITE_CONFIG.url}/teams`,
      lastModified: LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_CONFIG.url}/time-measurement`,
      lastModified: LAST_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ];
}
