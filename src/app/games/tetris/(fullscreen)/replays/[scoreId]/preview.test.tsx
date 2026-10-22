import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGameScoreSummary = vi.fn();
vi.mock('@/services/gameServerService', () => ({ getGameScoreSummary: (...a: unknown[]) => getGameScoreSummary(...a) }));
// 폰트는 외부 네트워크 — 테스트에서는 못 받은 경우(ASCII 카드)로 고정
const loadKoreanFont = vi.fn();
vi.mock('@/app/games/_shared/lib/ogFont', () => ({ loadKoreanFont: (...a: unknown[]) => loadKoreanFont(...a) }));

import { generateMetadata } from './page';
import { GET } from '../../../replays/[scoreId]/og/route';
import { absoluteUrl } from '@/app/games/_shared/lib/shareSpec';
import { TETRIS_SHARE } from '../../../lib/share';

const summary = {
  rank: 2,
  scoreId: 12,
  playerName: '테트리스왕',
  score: 12340,
  detail: { lines: 40, level: 5, pieces: 1, tSpins: 0, tetrises: 0, maxCombo: 0, engineVersion: 1, das: 10, arr: 2 },
  durationMs: 83000,
  createdAt: '2026-10-21T00:00:00Z',
};
const params = (scoreId: string) => ({ params: Promise.resolve({ scoreId }) });

describe('리플레이 링크 미리보기 (DESIGN §3)', () => {
  beforeEach(() => {
    getGameScoreSummary.mockReset();
    loadKoreanFont.mockReset().mockResolvedValue(null);
  });

  it('기록이 있으면 제목·설명·og url·canonical, noindex 유지', async () => {
    getGameScoreSummary.mockResolvedValue(summary);
    const meta = await generateMetadata(params('12'));
    expect(getGameScoreSummary).toHaveBeenCalledWith('tetris', 12);
    expect(meta.title).toBe('테트리스왕님의 테트리스 12,340점 | 리플레이');
    expect(meta.description).toContain('40줄 · 레벨 5 · 1:23 · 전체 2위');
    expect(meta.openGraph).toMatchObject({ url: '/games/tetris/replays/12' });
    expect(meta.alternates).toEqual({ canonical: '/games/tetris/replays/12' });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('og:image는 카카오 카드와 같은 고정 경로(route group 해시 접미사 없음)·siteName 포함', async () => {
    getGameScoreSummary.mockResolvedValue(summary);
    const meta = await generateMetadata(params('12'));
    const og = meta.openGraph as { images: { url: string }[]; siteName: string };
    expect(og.images[0].url).toBe('/games/tetris/replays/12/og');
    expect(absoluteUrl(TETRIS_SHARE.imagePath(12)).endsWith(og.images[0].url)).toBe(true);
    expect(og.siteName).toBe('FiveSouth');
  });

  it('없음·숨김·네트워크 실패(null)면 일반 테트리스 메타로 폴백 — notFound를 던지지 않는다', async () => {
    getGameScoreSummary.mockResolvedValue(null);
    const meta = await generateMetadata(params('99'));
    expect(meta.title).toBe('테트리스 리플레이');
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toEqual({ canonical: '/games/tetris/replays/99' });
  });

  it('숫자가 아닌 경로는 백엔드에 묻지 않는다', async () => {
    const meta = await generateMetadata(params('abc'));
    expect(getGameScoreSummary).not.toHaveBeenCalled();
    expect(meta.title).toBe('테트리스 리플레이');
  });

  it('OG 이미지: 기록·폴백 모두 1200×630 PNG (한글 폰트 없이도 렌더)', async () => {
    getGameScoreSummary.mockResolvedValueOnce(summary).mockResolvedValueOnce(null);
    for (const id of ['12', '99']) {
      const res = await GET(new Request('http://x'), params(id));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const bytes = new Uint8Array(await res.arrayBuffer());
      expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]); // "PNG"
    }
    expect(loadKoreanFont).toHaveBeenCalledTimes(2);
  }, 30000);

  it('캐시: 기록+한글 카드는 10분, 폴백 카드(일시 실패 가능)는 1분 — 1년 immutable 기본값을 덮는다', async () => {
    const font = new Uint8Array(0).buffer;
    getGameScoreSummary.mockResolvedValue(summary);
    loadKoreanFont.mockResolvedValueOnce(null);
    const fallback = await GET(new Request('http://x'), params('12'));
    expect(fallback.headers.get('cache-control')).toBe('public, max-age=60');
    getGameScoreSummary.mockResolvedValue(null);
    const missing = await GET(new Request('http://x'), params('99'));
    expect(missing.headers.get('cache-control')).toBe('public, max-age=60');
    // 한글 폰트를 받은 경우의 헤더만 확인 (빈 폰트라 렌더는 하지 않는다)
    getGameScoreSummary.mockResolvedValue(summary);
    loadKoreanFont.mockResolvedValueOnce(font);
    const ok = await GET(new Request('http://x'), params('12'));
    expect(ok.headers.get('cache-control')).toBe('public, max-age=600');
  }, 30000);
});
