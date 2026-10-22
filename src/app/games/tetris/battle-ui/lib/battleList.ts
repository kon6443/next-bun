import type { BattleLobbyStats } from '@/services/tetrisBattleService';

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
