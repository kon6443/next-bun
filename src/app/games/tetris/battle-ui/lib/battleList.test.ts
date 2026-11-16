import { describe, it, expect } from 'vitest';
import { battleRoomPath, lobbyStatsLabel, pickQuickJoinRoom } from './battleList';

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

describe('pickQuickJoinRoom (games-polish P7)', () => {
  const room = (code: string, playerCount: number, extra: { locked?: boolean; maxPlayers?: number; status?: 'WAITING' | 'PLAYING' } = {}) => ({
    code,
    playerCount,
    maxPlayers: extra.maxPlayers ?? 4,
    locked: extra.locked ?? false,
    status: extra.status,
  });

  it('잠기지 않은 대기 방 중 빈자리 있고 사람이 가장 많은 곳 — 같으면 앞쪽', () => {
    const rooms = [room('A', 1), room('B', 3, { locked: true }), room('C', 4), room('D', 2, { status: 'PLAYING' }), room('E', 2), room('F', 2)];
    expect(pickQuickJoinRoom(rooms)?.code).toBe('E');
  });

  it('들어갈 방이 없으면 null', () => {
    expect(pickQuickJoinRoom([room('A', 1, { locked: true }), room('B', 2, { maxPlayers: 2 })])).toBeNull();
    expect(pickQuickJoinRoom([])).toBeNull();
  });
});

describe('battleRoomPath', () => {
  it('잠긴 방은 비밀번호부터 묻는 주소(?locked=1) — 홈 입구에서 방 목록이 빠져도 로비가 쓴다', () => {
    expect(battleRoomPath('ABC123')).toBe('/games/tetris/battle/ABC123');
    expect(battleRoomPath('ABC123', true)).toBe('/games/tetris/battle/ABC123?locked=1');
  });
});
