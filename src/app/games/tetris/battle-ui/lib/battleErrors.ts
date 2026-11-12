import type { TetrisBattleErrorCode } from '@/types/tetrisBattleSocket';
import { type RequestFailureCode, createBattleErrorMessage } from '@/app/games/_shared/battle-room/lib/battleErrors';

/** 서버 에러 코드 + 클라이언트 쪽 실패(응답 없음·연결 끊김) */
export type BattleRequestErrorCode = TetrisBattleErrorCode | RequestFailureCode;

/** 코드 → 한국어 안내 — 방 코어 공통 + 테트리스 대전 전용 */
export const battleErrorMessage = createBattleErrorMessage({
  PLAYER_NOT_ALIVE: '이미 탈락했어요.',
});
