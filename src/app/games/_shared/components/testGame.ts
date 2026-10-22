import type { GameUiConfig } from '../lib/gameConfig';
import { createGameStorage } from '../lib/storage';

/** 공용 컴포넌트 테스트용 가짜 게임 사양 — 테트리스가 아닌 게임에서도 경로·문구가 사양을 따르는지 */
export const TEST_GAME: GameUiConfig<'defense'> = {
  gameType: 'defense',
  name: '타워 디펜스',
  homePath: '/games/defense',
  playPath: '/games/defense/play/endless',
  rankingsPath: '/games/defense/rankings',
  replayPath: (scoreId) => `/games/defense/replays/${scoreId}`,
  rankingDetail: (item) => `웨이브 ${item.detail.wave}`,
  storage: createGameStorage('defense', { pendingKind: 'local', pendingLimit: 3 }),
};
