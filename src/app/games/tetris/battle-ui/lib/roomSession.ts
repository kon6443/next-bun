import { createRoomSessionStore } from '@/app/games/_shared/battle-room/lib/roomSession';

export { ROOM_SESSION_TTL_MS, type RoomSession } from '@/app/games/_shared/battle-room/lib/roomSession';

/** 테트리스 대전 재연결 정보 — 저장 키 `tetris:battle:{code}` (이전 배포와 같은 키, 바꾸면 진행 중인 방의 자리를 잃는다) */
const store = createRoomSessionStore('tetris:battle:');

export const { loadRoomSession, saveRoomSession, clearRoomSession, resetRoomSessionForTest } = store;
