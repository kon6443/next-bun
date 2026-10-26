// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { PopularReplaysPreview } from './PopularReplaysPreview';
import { TEST_GAME } from './testGame';

const getPopularReplays = vi.fn();
vi.mock('@/services/gameService', () => ({
  getPopularReplays: (...a: unknown[]) => getPopularReplays(...a),
}));

const item = { rank: 1, scoreId: 5, playerName: '수비왕', score: 100, detail: { wave: 3 }, durationMs: 60_000, createdAt: '2026-10-21T00:00:00Z', periodViewCount: 8, periodWatchMs: 0 };

describe('PopularReplaysPreview — 홈 "오늘 많이 본 리플레이"', () => {
  beforeEach(() => {
    getPopularReplays.mockReset();
  });

  it('오늘·조회순으로 불러 기간 조회수와 ▶ 링크를 보인다', async () => {
    getPopularReplays.mockResolvedValue({ code: 'SUCCESS', message: 'ok', data: { items: [item] } });
    await act(async () => {
      render(<PopularReplaysPreview game={TEST_GAME} myScoreIds={new Set()} />);
    });
    expect(getPopularReplays).toHaveBeenCalledWith('defense', { period: 'daily', sort: 'views', limit: 5 }, undefined);
    expect(screen.getByText('· 조회 8')).toBeTruthy();
    expect(screen.getByRole('link', { name: /리플레이 보기/ }).getAttribute('href')).toBe('/games/defense/replays/5');
  });

  it('불러오지 못하면(백엔드 배포 전 404 등) 섹션을 숨긴다', async () => {
    getPopularReplays.mockRejectedValue(new Error('404'));
    await act(async () => {
      render(<PopularReplaysPreview game={TEST_GAME} myScoreIds={new Set()} />);
    });
    expect(screen.queryByTestId('popular-replays')).toBeNull();
  });
});
