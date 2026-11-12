import { createRoomSessionStore } from '@/app/games/_shared/battle-room/lib/roomSession';

/** 포트리스 대전 재연결 정보 — 저장 키 'fortress:battle:'(테트리스와 따로) */
export const { loadRoomSession, saveRoomSession, clearRoomSession, resetRoomSessionForTest } = createRoomSessionStore('fortress:battle:');
