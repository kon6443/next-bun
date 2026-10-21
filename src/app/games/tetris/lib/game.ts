import type { GameUiConfig } from '@/app/games/_shared/lib/gameConfig';
import { tetrisDuration, tetrisStatLine } from './replayCard';
import { TETRIS_SHARE } from './share';
import { tetrisStorage } from './storage';

/** 테트리스 화면 사양 — 공용 랭킹·등록 패널에 넘긴다 */
export const TETRIS_GAME: GameUiConfig<'tetris'> = {
  gameType: 'tetris',
  name: '테트리스',
  homePath: '/games/tetris',
  playPath: '/games/tetris/play',
  rankingsPath: '/games/tetris/rankings',
  replayPath: TETRIS_SHARE.replayPath,
  rankingDetail: (item) => `${tetrisStatLine(item.detail)} · ${tetrisDuration(item.durationMs)}`,
  storage: tetrisStorage,
};
