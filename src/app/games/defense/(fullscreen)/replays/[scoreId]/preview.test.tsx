import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGameScoreSummary = vi.fn();
vi.mock('@/services/gameServerService', () => ({ getGameScoreSummary: (...a: unknown[]) => getGameScoreSummary(...a) }));
// 폰트는 외부 네트워크 — 테스트에서는 못 받은 경우(ASCII 카드)로 고정
const loadKoreanFont = vi.fn();
vi.mock('@/app/games/_shared/lib/ogFont', () => ({ loadKoreanFont: (...a: unknown[]) => loadKoreanFont(...a) }));

import { generateMetadata } from './page';
import { GET } from '../../../replays/[scoreId]/og/route';

const summary = { rank: 3, scoreId: 46, boardKey: 'endless-s1', playerName: '수비왕', score: 24_523_000, detail: { wave: 24, progress: 523, kills: 812, livesLeft: 2 }, durationMs: 1_880_000, createdAt: '2026-10-22T00:00:00Z' };
const params = (scoreId: string) => ({ params: Promise.resolve({ scoreId }) });

describe('디펜스 리플레이 링크 미리보기 (§F11)', () => {
  beforeEach(() => {
    getGameScoreSummary.mockReset();
    loadKoreanFont.mockReset().mockResolvedValue(null);
  });

  it('기록이 있으면 "웨이브 n · 진척 p%" 제목·설명, 고정 og 경로, noindex', async () => {
    getGameScoreSummary.mockResolvedValue(summary);
    const meta = await generateMetadata(params('46'));
    expect(getGameScoreSummary).toHaveBeenCalledWith('defense', 46);
    expect(meta.title).toBe('수비왕님의 타워 디펜스(무한 시즌 1) 웨이브 24 · 진척 52% 리플레이');
    expect(meta.description).toContain('처치 812 · 남은 목숨 2 · 31:20 · 무한 시즌 1 · 3위');
    expect(meta.alternates).toEqual({ canonical: '/games/defense/replays/46' });
    expect(JSON.stringify(meta.openGraph)).toContain('/games/defense/replays/46/og');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('기록이 없으면 일반 메타로 폴백(notFound 없이)', async () => {
    getGameScoreSummary.mockResolvedValue(null);
    const meta = await generateMetadata(params('99'));
    expect(meta.title).toContain('타워 디펜스 리플레이');
  });

  it('OG 이미지 — 기록·폴백 모두 1200×630 PNG(한글 폰트 없이도)', async () => {
    for (const [id, value] of [['46', summary], ['99', null]] as const) {
      getGameScoreSummary.mockResolvedValue(value);
      const res = await GET(new Request('http://x'), params(id));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    }
  });
});
