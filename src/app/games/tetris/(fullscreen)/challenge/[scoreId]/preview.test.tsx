import { describe, it, expect, vi, beforeEach } from 'vitest';

const getGameScoreSummary = vi.fn();
vi.mock('@/services/gameServerService', () => ({ getGameScoreSummary: (...a: unknown[]) => getGameScoreSummary(...a) }));
// 폰트는 외부 네트워크 — 테스트에서는 못 받은 경우(ASCII 카드)로 고정
const loadKoreanFont = vi.fn();
vi.mock('@/app/games/_shared/lib/ogFont', () => ({ loadKoreanFont: (...a: unknown[]) => loadKoreanFont(...a) }));
// 플레이 화면은 이 테스트와 무관
vi.mock('../../play/TetrisPlay', () => ({ default: () => null }));

import { generateMetadata } from './page';
import { GET } from '../../../challenge/[scoreId]/og/route';

const summary = {
  rank: 2,
  scoreId: 41,
  playerName: '테트리스왕',
  score: 12340,
  detail: { lines: 40, level: 5, pieces: 1, tSpins: 0, tetrises: 0, maxCombo: 0, engineVersion: 1, das: 10, arr: 2 },
  durationMs: 83000,
  createdAt: '2026-10-21T00:00:00Z',
};
const params = (scoreId: string) => ({ params: Promise.resolve({ scoreId }) });

describe('도전장 링크 미리보기 (games-growth B2)', () => {
  beforeEach(() => {
    getGameScoreSummary.mockReset();
    loadKoreanFont.mockReset().mockResolvedValue(null);
  });

  it('기록이 있으면 "○○님의 12,340점에 도전!" + 고정 og 이미지, noindex', async () => {
    getGameScoreSummary.mockResolvedValue(summary);
    const meta = await generateMetadata(params('41'));
    expect(getGameScoreSummary).toHaveBeenCalledWith('tetris', 41);
    expect(meta.title).toBe('테트리스왕님의 12,340점에 도전!');
    expect((meta.openGraph as { images: { url: string }[] }).images[0].url).toBe('/games/tetris/challenge/41/og');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('숫자가 아닌 경로는 묻지 않고 일반 도전장 메타', async () => {
    const meta = await generateMetadata(params('abc'));
    expect(getGameScoreSummary).not.toHaveBeenCalled();
    expect(meta.title).toBe('테트리스 도전장');
  });

  it('OG 이미지: 기록·폴백 모두 1200×630 PNG', async () => {
    getGameScoreSummary.mockResolvedValue(summary);
    const res = await GET(new Request('http://x'), params('41'));
    expect(res.headers.get('content-type')).toBe('image/png');
    getGameScoreSummary.mockResolvedValue(null);
    const fallback = await GET(new Request('http://x'), params('41'));
    expect(fallback.headers.get('content-type')).toBe('image/png');
  });

  it('링크 id가 도전장 보드 기록이면 미리보기는 원본(root) 기준 — 받은 사람이 실제로 도전하는 상대', async () => {
    getGameScoreSummary.mockImplementation((_g: string, id: number) =>
      Promise.resolve(id === 50 ? { ...summary, scoreId: 50, playerName: '도전자', score: 500, boardKey: 'challenge-41' } : { ...summary, boardKey: 'default' }),
    );
    const meta = await generateMetadata(params('50'));
    expect(getGameScoreSummary).toHaveBeenCalledWith('tetris', 41);
    expect(meta.title).toBe('테트리스왕님의 12,340점에 도전!');
  });
});
