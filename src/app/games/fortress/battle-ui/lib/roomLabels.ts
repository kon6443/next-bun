import type { RoomMapId, RoomMode, RoomSettings } from '@/types/fortressSocket';

export const MODE_LABEL: Record<RoomMode, string> = { ffa: '개인전', team: '팀전 2:2' };
export const MAP_LABEL: Record<RoomMapId, string> = { hills: '언덕', canyon: '협곡', random: '무작위' };
export const TEAM_LABEL = ['파랑 팀', '주황 팀'] as const;

/** 방 목록·대기실 한 줄 요약 — "개인전 · 언덕" */
export function settingsSummary(settings: Pick<RoomSettings, 'mode' | 'mapId'>): string {
  return `${MODE_LABEL[settings.mode]} · ${MAP_LABEL[settings.mapId]}`;
}

/** 방 경로·초대 링크 — 잠긴 방은 비밀번호부터 묻는다 */
export const FORTRESS_LOBBY_PATH = '/games/fortress/battle';
export const fortressRoomPath = (code: string, locked = false) => `${FORTRESS_LOBBY_PATH}/${code}${locked ? '?locked=1' : ''}`;
export const FORTRESS_LOBBY_CHAT_SECTION_ID = 'lobby-chat';
