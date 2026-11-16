import { createBattleErrorMessage } from '@/app/games/_shared/battle-room/lib/battleErrors';

/** 코드 → 한국어 안내 — 방 코어 공통 + 테트리스 대전 전용 */
export const battleErrorMessage = createBattleErrorMessage({
  PLAYER_NOT_ALIVE: '이미 탈락했어요.',
});
