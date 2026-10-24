// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { HallOfFame, hallOfFamePeriodLabel } from './HallOfFame';
import { TrophyBadge, trophyLabel } from './TrophyBadge';
import { TEST_GAME } from './testGame';

const getHallOfFame = vi.fn();
vi.mock('@/services/gameService', () => ({ getHallOfFame: (...a: unknown[]) => getHallOfFame(...a) }));

const HOUR = 60 * 60 * 1000;
const podium = (base: number) =>
  [1, 2, 3].map((rank) => ({ rank, scoreId: base + rank, playerName: `선수${rank}`, score: 1000 - rank, detail: { wave: 1 }, durationMs: 1, createdAt: 'x' }));
// 10/19(월) 0시 KST ~ 10/26(월) 0시 KST
const weekly = { kind: 'weekly', boardKey: 'weekly-2026-w43', startsAt: '2026-10-18T15:00:00Z', endsAt: '2026-10-25T15:00:00Z', podium: podium(10) };
// 10/24 하루
const daily = { kind: 'daily', boardKey: 'daily-2026-10-24', startsAt: '2026-10-23T15:00:00Z', endsAt: '2026-10-24T15:00:00Z', podium: podium(20) };

describe('명예의 전당 (games-growth B5)', () => {
  beforeEach(() => {
    getHallOfFame.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('기간 표기 — 주간은 시작~마지막 날(KST), 데일리는 그날', () => {
    expect(hallOfFamePeriodLabel(weekly as never)).toBe('10/19 ~ 10/25 주간');
    expect(hallOfFamePeriodLabel(daily as never)).toBe('10/24 데일리');
  });

  it('기간별 1~3위와 ▶ — 그 기간 끝 + 공개 지연 전에는 ▶를 끈다', async () => {
    // 데일리 끝(10/24 15:00Z) + 1시간 — 데일리 지연 2시간 안, 주간은 지연 0이지만 아직 끝나지 않은 주
    vi.setSystemTime(Date.parse(daily.endsAt) + HOUR);
    getHallOfFame.mockResolvedValue({ data: { periods: [{ ...weekly, endsAt: '2026-10-24T15:00:00Z' }, daily] } });
    await act(async () => {
      render(<HallOfFame game={TEST_GAME} replayDelayMs={{ daily: 2 * HOUR }} />);
    });
    expect(getHallOfFame).toHaveBeenCalledWith('defense');
    expect(screen.getByRole('heading', { name: '🏆 명예의 전당' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '10/19 ~ 10/24 주간 1위 선수1 리플레이 보기' }).getAttribute('href')).toBe('/games/defense/replays/11');
    const locked = screen.getByRole('button', { name: '10/24 데일리 1위 선수1 리플레이 — 곧 공개돼요' }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    expect(screen.getAllByText('🥇')).toHaveLength(2);
  });

  it('비었거나 못 받으면 섹션을 숨긴다', async () => {
    getHallOfFame.mockResolvedValue({ data: { periods: [] } });
    const { unmount } = await act(async () => render(<HallOfFame game={TEST_GAME} />));
    expect(screen.queryByTestId('hall-of-fame')).toBeNull();
    unmount();
    getHallOfFame.mockRejectedValue(new Error('503'));
    await act(async () => {
      render(<HallOfFame game={TEST_GAME} />);
    });
    expect(screen.queryByTestId('hall-of-fame')).toBeNull();
  });
});

describe('입상 배지 (games-growth B5)', () => {
  it('횟수가 있는 메달만, 읽는 이름은 "명예의 전당 1위 1회·3위 2회"', () => {
    expect(trophyLabel({ gold: 1, silver: 0, bronze: 2 })).toBe('1위 1회·3위 2회');
    render(<TrophyBadge trophies={{ gold: 1, silver: 0, bronze: 2 }} />);
    const badge = screen.getByRole('img', { name: '명예의 전당 1위 1회·3위 2회' });
    expect(badge.textContent).toBe('🥇1🥉2');
  });

  it('null·입상 없음은 그리지 않는다', () => {
    const { container } = render(
      <>
        <TrophyBadge trophies={null} />
        <TrophyBadge trophies={{ gold: 0, silver: 0, bronze: 0 }} />
      </>,
    );
    expect(container.innerHTML).toBe('');
  });
});
