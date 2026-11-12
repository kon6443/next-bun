import type { RoomStatus } from './roomContract';

export type JoinCandidate = { playerCount: number; maxPlayers: number; locked: boolean; status?: RoomStatus };

/**
 * 빠른 참가할 방 — 잠기지 않은 대기 방 중 빈자리가 있고 사람이 가장 많은 곳(같으면 목록 앞쪽). 없으면 null
 * 입구(REST) 목록은 상태 없이 대기 방만 오고 이미 사람 많은 순이라 첫 열린 방이 된다
 */
export function pickQuickJoinRoom<T extends JoinCandidate>(rooms: readonly T[]): T | null {
  let best: T | null = null;
  for (const room of rooms) {
    if (room.locked || room.playerCount >= room.maxPlayers || (room.status !== undefined && room.status !== 'WAITING')) continue;
    if (!best || room.playerCount > best.playerCount) best = room;
  }
  return best;
}
