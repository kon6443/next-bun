import { createHiddenSendersStore } from '@/app/games/_shared/battle-room/lobby-chat/hiddenSenders';

/** 포트리스 로비 채팅에서 숨긴 사람 — 채널이 테트리스와 달라 저장도 따로 */
export const fortressHiddenSenders = createHiddenSendersStore('fortress:lobbyChatHidden');
