import { createBattleErrorMessage } from '@/app/games/_shared/battle-room/lib/battleErrors';

/** 코드 → 한국어 안내 — 방 코어 공통 + 포트리스 전용(턴·팀·설정) */
export const battleErrorMessage = createBattleErrorMessage({
  NOT_YOUR_TURN: '지금은 내 차례가 아니에요.',
  TURN_MISMATCH: '차례가 바뀌었어요. 화면을 맞추는 중이에요.',
  TURN_EXPIRED: '시간이 지나 이번 차례는 넘어갔어요.',
  MATCH_NOT_STARTED: '아직 시작 전이에요. 카운트다운이 끝나면 쏘세요.',
  ACTION_REJECTED: '그 행동은 할 수 없어요. 다시 맞춰 주세요.',
  TEAM_FULL: '그 팀은 이미 2명이에요.',
  TEAM_UNBALANCED: '팀을 2:2로 맞춰야 시작할 수 있어요.',
  TOO_MANY_PLAYERS: '지금 인원보다 적게 줄일 수 없어요.',
});
