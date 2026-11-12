import { createHiddenSendersStore } from '@/app/games/_shared/battle-room/lobby-chat/hiddenSenders';

/** 테트리스 로비 채팅에서 숨긴 사람 — 저장 키는 이전 배포와 같다 */
const store = createHiddenSendersStore('tetris:lobbyChatHidden');

export const tetrisHiddenSenders = store;
export const loadHiddenSenders = store.load;
export const saveHiddenSenders = store.save;
