import type { BattleLobbyStats } from '@/services/tetrisBattleService';
import type { RoomStatus } from '@/types/tetrisBattleSocket';

/**
 * 대전 입구 문구 (DESIGN §19) — 테트리스 홈의 방 수, 최근 대전 목록의 시각
 */

/**
 * "지금 열린 방 3개" / 들어갈 방이 없으면 방 만들기 권유
 * 모바일 2열 버튼의 반 칸(약 150px) 한 줄에 들어가게 짧게 — 경기 중인 방은 들어갈 수 없어 세지 않는다
 */
export function lobbyStatsLabel(stats: BattleLobbyStats): string {
  return stats.waitingRooms > 0 ? `지금 열린 방 ${stats.waitingRooms}개` : '방을 만들어 보세요';
}

/** 방 화면 주소 — 잠긴 방은 비밀번호부터 묻는다 */
export const battleRoomPath = (code: string, locked = false) => `/games/tetris/battle/${code}${locked ? '?locked=1' : ''}`;

/** 로비의 방 만들기 카드 — 입구의 "방 만들기"가 여기로 */
export const BATTLE_CREATE_HREF = '/games/tetris/battle#battle-create';

type JoinCandidate = { playerCount: number; maxPlayers: number; locked: boolean; status?: RoomStatus };

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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 끝난 시각 → "방금" · "5분 전" · "3시간 전" · "2일 전" · 7일 이상은 "10월 15일" (로컬 표시) */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const at = new Date(iso);
  const diff = now - at.getTime();
  if (!Number.isFinite(diff)) return '';
  if (diff < MINUTE) return '방금';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}일 전`;
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}
