import type { BattleEmoteId } from './roomContract';

/** 이모트 프리셋 표시 — id는 서버 계약(BATTLE_EMOTE_IDS — 두 게임 같은 id) */
export const EMOTE_LABELS: Record<BattleEmoteId, { emoji: string; label: string }> = {
  gg: { emoji: '🤝', label: 'GG' },
  nice: { emoji: '👍', label: '나이스' },
  wow: { emoji: '😮', label: '와우' },
  laugh: { emoji: '😂', label: 'ㅋㅋ' },
  cry: { emoji: '😭', label: '흑흑' },
  angry: { emoji: '😤', label: '분노' },
};

/** 받은 이모트를 말풍선으로 보여 줄 시간 */
export const EMOTE_SHOW_MS = 3000;
