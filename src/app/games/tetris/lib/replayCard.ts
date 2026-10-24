import type { ScoreSummary, TetrisScoreDetail } from '@/types/game';
import { FRAMES_PER_SECOND } from '../engine';
import { formatFrames, formatScore } from '@/app/games/_shared/lib/format';
import { type ReplayCard, isAscii } from '@/app/games/_shared/lib/replayCard';
import { dailyDateLabel, isDailyBoardKey } from './daily';

/**
 * 테트리스 기록 문구 — 랭킹 행·공유·링크 미리보기·OG 카드가 같은 표현을 쓴다
 */

/** "40줄 · 레벨 5" */
export function tetrisStatLine(detail: Pick<TetrisScoreDetail, 'lines' | 'level'>): string {
  return `${detail.lines}줄 · 레벨 ${detail.level}`;
}

/** 랭킹 durationMs → "m:ss" (60Hz 프레임으로 되돌려 표시) */
export function tetrisDuration(durationMs: number): string {
  return formatFrames(Math.round((durationMs * FRAMES_PER_SECOND) / 1000));
}

/**
 * 순위 문구 — 기록이 속한 보드 기준(rank는 그 보드 전체 기간 순위): "전체 3위" · "10/24 데일리 3위" · "도전장 3위"
 * 리플레이 머리줄·링크 미리보기·OG 카드가 같은 표현을 쓴다
 */
export function tetrisRankLabel(boardKey: string | undefined, rank: number): string {
  if (boardKey && isDailyBoardKey(boardKey)) return `${dailyDateLabel(boardKey)} 데일리 ${rank}위`;
  if (boardKey && /^challenge-[1-9]\d{0,14}$/.test(boardKey)) return `도전장 ${rank}위`;
  return `전체 ${rank}위`;
}

/** 미리보기 카드 문구 — 한글 폰트가 없으면(korean=false) ASCII만 */
export function buildReplayCard(summary: ScoreSummary | null, korean: boolean): ReplayCard {
  if (!summary) {
    return {
      eyebrow: 'TETRIS',
      name: null,
      score: null,
      scoreUnit: '',
      stats: korean ? '브라우저에서 바로 하는 테트리스 · 랭킹 · 리플레이' : 'Play, rank, and watch replays',
      footer: 'FiveSouth',
    };
  }
  const { lines, level } = summary.detail;
  const time = tetrisDuration(summary.durationMs);
  return {
    eyebrow: korean ? `테트리스 리플레이 · ${tetrisRankLabel(summary.boardKey, summary.rank)}` : `TETRIS REPLAY · #${summary.rank}`,
    name: korean || isAscii(summary.playerName) ? summary.playerName : null,
    score: formatScore(summary.score),
    scoreUnit: korean ? '점' : 'PTS',
    stats: korean ? `${tetrisStatLine(summary.detail)} · ${time}` : `${lines} LINES · LV ${level} · ${time}`,
    footer: 'FiveSouth',
  };
}
