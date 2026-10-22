import { describe, it, expect } from 'vitest';
import { formatRelativeTime, lobbyStatsLabel } from './battleList';

describe('lobbyStatsLabel — 테트리스 홈 방 수', () => {
  it('들어갈 수 있는 방이 있으면 개수 — 경기 중인 방은 세지 않는다', () => {
    expect(lobbyStatsLabel({ waitingRooms: 3, playingRooms: 0 })).toBe('지금 열린 방 3개');
    expect(lobbyStatsLabel({ waitingRooms: 2, playingRooms: 1 })).toBe('지금 열린 방 2개');
  });

  it('들어갈 방이 없으면 방 만들기 권유', () => {
    expect(lobbyStatsLabel({ waitingRooms: 0, playingRooms: 0 })).toBe('방을 만들어 보세요');
    expect(lobbyStatsLabel({ waitingRooms: 0, playingRooms: 2 })).toBe('방을 만들어 보세요');
  });
});

describe('formatRelativeTime — 최근 대전 시각', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('방금·분·시간·일 전', () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe('방금');
    expect(formatRelativeTime(ago(5 * 60_000), now)).toBe('5분 전');
    expect(formatRelativeTime(ago(3 * 3_600_000), now)).toBe('3시간 전');
    expect(formatRelativeTime(ago(2 * 86_400_000), now)).toBe('2일 전');
  });

  it('7일 이상은 월·일 (로컬 표시), 잘못된 값은 빈 문자열', () => {
    const old = new Date(now - 10 * 86_400_000);
    expect(formatRelativeTime(old.toISOString(), now)).toBe(`${old.getMonth() + 1}월 ${old.getDate()}일`);
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });

  it('시계가 조금 어긋나 미래 시각이면 방금', () => {
    expect(formatRelativeTime(new Date(now + 5_000).toISOString(), now)).toBe('방금');
  });
});
