import type { ScoreSummary } from '@/types/game';
import { FRAMES_PER_SECOND } from '../engine';
import { formatFrames, formatScore } from './format';

/**
 * 기록 미리보기 카드(OG 이미지) 문구 — 한글 폰트를 못 받으면 ASCII만으로 그린다
 * (next/og 기본 폰트는 라틴 전용이라, 한글이 있으면 렌더 중 외부 폰트를 받으러 가고 실패하면 이미지가 깨진다)
 */
/** 미리보기 카드 이미지 크기 — og 이미지 route와 페이지 og:image 메타가 함께 쓴다 */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export type ReplayCard = {
  eyebrow: string;
  /** 플레이어 이름 — ASCII 모드에서 이름이 한글이면 null */
  name: string | null;
  score: string | null;
  scoreUnit: string;
  stats: string;
  footer: string;
};

const isAscii = (text: string) => /^[\x20-\x7e]*$/.test(text);

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
  const time = formatFrames(Math.round((summary.durationMs * FRAMES_PER_SECOND) / 1000));
  return {
    eyebrow: korean ? `테트리스 리플레이 · 전체 ${summary.rank}위` : `TETRIS REPLAY · #${summary.rank}`,
    name: korean || isAscii(summary.playerName) ? summary.playerName : null,
    score: formatScore(summary.score),
    scoreUnit: korean ? '점' : 'PTS',
    stats: korean ? `${lines}줄 · 레벨 ${level} · ${time}` : `${lines} LINES · LV ${level} · ${time}`,
    footer: 'FiveSouth',
  };
}

/** 폰트 subset 요청에 넣을 글자 — 카드에 그리는 모든 문자 */
export function cardText(card: ReplayCard): string {
  return [card.eyebrow, card.name ?? '', card.score ?? '', card.scoreUnit, card.stats, card.footer].join('');
}

export function needsKoreanFont(summary: ScoreSummary | null): boolean {
  return !isAscii(cardText(buildReplayCard(summary, true)));
}
