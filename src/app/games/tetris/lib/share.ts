import type { TetrisScoreDetail } from '@/types/game';
import { formatScore } from '@/app/games/_shared/lib/format';
import type { ReplayShareSpec } from '@/app/games/_shared/lib/shareSpec';
import { buildReplayCard, tetrisDuration, tetrisStatLine } from './replayCard';

/**
 * 테트리스 리플레이 공유 사양 (DESIGN §2·§3) — 공유 메뉴·카카오 카드·링크 미리보기·OG 이미지 문구
 * 흐름(클립보드·Web Share·메타·카드 렌더)은 _shared/lib의 공통 함수가 맡는다
 */
export const TETRIS_SHARE: ReplayShareSpec<TetrisScoreDetail> = {
  replayPath: (scoreId) => `/games/tetris/replays/${scoreId}`,
  imagePath: (scoreId) => `/games/tetris/replays/${scoreId}/og`,
  headline: ({ playerName, score }) => `${playerName}님의 테트리스 ${formatScore(score)}점`,
  statLine: tetrisStatLine,
  metaDescription: (summary) =>
    `${tetrisStatLine(summary.detail)} · ${tetrisDuration(summary.durationMs)} · 전체 ${summary.rank}위 — 플레이를 그대로 다시 보세요.`,
  card: buildReplayCard,
  fallback: {
    title: '테트리스 리플레이',
    description: '브라우저에서 바로 하는 테트리스 — 랭킹과 리플레이로 실력을 겨뤄 보세요.',
    cardTitle: 'TETRIS',
  },
};
