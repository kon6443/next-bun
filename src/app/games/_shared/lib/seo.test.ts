import { describe, it, expect, vi } from 'vitest';
import type { Metadata } from 'next';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { metadata as gamesLayoutMetadata } from '@/app/games/layout';
import { metadata as tetrisLayoutMetadata } from '@/app/games/tetris/layout';
import { gameListJsonLd, gamePageMetadata, videoGameJsonLd } from './seo';

// 페이지 모듈이 끌어오는 클라이언트 화면은 메타 검사와 무관
vi.mock('@/app/games/defense/components/CampaignMap', () => ({ CampaignMap: () => null }));
vi.mock('@/app/games/defense/components/HubActions', () => ({ HubActions: () => null }));
vi.mock('@/app/games/defense/components/RankedCards', () => ({ RankedCards: () => null }));

describe('게임 페이지 SEO 메타', () => {
  it('페이지 메타는 자기 canonical·og:url·기본 미리보기 이미지를 갖는다', () => {
    const meta = gamePageMetadata({ title: '제목', description: '설명', path: '/games/x' });
    expect(meta.alternates?.canonical).toBe('/games/x');
    expect(meta.openGraph).toMatchObject({ url: '/games/x', siteName: SITE_CONFIG.name, title: `제목 | ${SITE_CONFIG.name}` });
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/opengraph-image?v=1' })]);
  });

  it('게임 layout은 canonical을 물려주지 않는다 — 따로 정하지 않은 하위 페이지가 /games·루트의 중복으로 보이지 않게', () => {
    expect(gamesLayoutMetadata.alternates?.canonical).toBeNull();
    expect(tetrisLayoutMetadata.alternates?.canonical).toBeUndefined();
    // 플레이·대전 화면 공유 미리보기 폴백(설명·이미지)은 남긴다
    expect(tetrisLayoutMetadata.description).toBeTruthy();
    expect(tetrisLayoutMetadata.openGraph?.images).toBeTruthy();
    // 미리보기 제목·설명은 비워 둔다 — 페이지(대전 초대 등)의 title·description으로 채워지게
    for (const layout of [gamesLayoutMetadata, tetrisLayoutMetadata]) {
      expect(layout.openGraph?.title).toBeUndefined();
      expect(layout.openGraph?.description).toBeUndefined();
      expect(layout.twitter?.title).toBeUndefined();
      expect(layout.twitter?.description).toBeUndefined();
    }
  });

  it('sitemap에 낸 게임 주소마다 그 페이지의 canonical이 자기 주소다 — layout이 canonical을 물려주지 않아 빠뜨리면 조용히 빈다', async () => {
    const pages: Record<string, () => Promise<Metadata>> = {
      '/games': async () => (await import('@/app/games/page')).metadata,
      '/games/tetris': async () => (await import('@/app/games/tetris/page')).metadata,
      '/games/tetris/rankings': async () => (await import('@/app/games/tetris/rankings/page')).metadata,
      '/games/tetris/skins': async () => (await import('@/app/games/tetris/skins/page')).metadata,
      '/games/defense': async () => (await import('@/app/games/defense/page')).metadata,
      '/games/defense/rankings': async () => (await import('@/app/games/defense/rankings/page')).metadata,
    };
    const gamePaths = sitemap()
      .map((entry) => entry.url.replace(SITE_CONFIG.url, ''))
      .filter((path) => path.startsWith('/games'));
    for (const path of gamePaths) {
      const stage = /^\/games\/defense\/campaign\/(s\d)$/.exec(path);
      const metadata = stage
        ? await (await import('@/app/games/defense/campaign/[stageId]/page')).generateMetadata({ params: Promise.resolve({ stageId: stage[1] }) })
        : await pages[path]?.();
      expect(metadata?.alternates?.canonical, path).toBe(path);
      // sitemap에 낸 페이지가 noindex가 되면 안 된다
      expect(metadata?.robots, path).toBeUndefined();
    }
  });

  it('최근 대전 목록은 자기 canonical, 도감은 noindex(클라이언트 진행도만 그려 서버 HTML이 비었다)', async () => {
    expect((await import('@/app/games/tetris/(fullscreen)/battle/matches/page')).metadata.alternates?.canonical).toBe('/games/tetris/battle/matches');
    expect((await import('@/app/games/defense/codex/page')).metadata.robots).toMatchObject({ index: false });
  });

  it('구조화 데이터 — 게임은 무료 VideoGame, 목록은 ItemList(절대 주소)', () => {
    const game = videoGameJsonLd({ name: '테트리스', description: 'd', path: '/games/tetris', genre: ['퍼즐'] });
    expect(game).toMatchObject({ '@type': 'VideoGame', url: `${SITE_CONFIG.url}/games/tetris`, isAccessibleForFree: true, offers: { price: 0 } });
    const list = gameListJsonLd([{ name: '테트리스', path: '/games/tetris' }]);
    expect(list.itemListElement).toEqual([{ '@type': 'ListItem', position: 1, name: '테트리스', url: `${SITE_CONFIG.url}/games/tetris` }]);
  });
});

describe('robots·sitemap', () => {
  it('robots: 개발 화면만 막고(noindex 페이지는 막지 않아 noindex를 읽게) sitemap 위치를 알린다', () => {
    const result = robots();
    const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rule.disallow).toEqual(expect.arrayContaining(['/games/defense/dev']));
    const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow ?? ''];
    expect(disallow.filter((path) => path.startsWith('/games/defense/replays'))).toEqual([]);
    expect(result.sitemap).toBe(`${SITE_CONFIG.url}/sitemap.xml`);
  });

  it('sitemap: 게임 허브·게임·랭킹·디펜스 캠페인은 넣고, noindex·얇은 페이지(리플레이·플레이·대전·도감)는 넣지 않는다', () => {
    const urls = sitemap().map((entry) => entry.url.replace(SITE_CONFIG.url, ''));
    expect(urls).toEqual(
      expect.arrayContaining([
        '/games',
        '/games/tetris',
        '/games/tetris/rankings',
        '/games/defense',
        '/games/defense/rankings',
        '/games/defense/campaign/s1',
        '/games/defense/campaign/s8',
      ]),
    );
    expect(urls.filter((url) => /\/replays\/|\/play(\/|$)|\/battle\/|\/codex$/.test(url))).toEqual([]);
  });
});
