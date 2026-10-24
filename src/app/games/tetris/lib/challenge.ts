import type { Metadata } from 'next';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import { formatScore } from '@/app/games/_shared/lib/format';
import { OG_SIZE, type ReplayCard, isAscii } from '@/app/games/_shared/lib/replayCard';
import { type ShareContent, absoluteUrl } from '@/app/games/_shared/lib/shareSpec';
import type { ScoreSummary, TetrisScoreDetail } from '@/types/game';
import { tetrisStatLine } from './replayCard';

/**
 * 테트리스 도전장 (games-growth B2) — 남의 기록과 같은 seed로 한 판. 결과는 원본별 도전장 보드(challenge-{원본 id})에만
 * 링크는 /games/tetris/challenge/{기록 id} — 도전장 기록 id를 넣어도 서버가 원본(root)으로 묶는다
 */

export const challengePath = (scoreId: number | string) => `/games/tetris/challenge/${scoreId}`;
/** route group 밖 고정 route handler — 카카오 카드에 넣을 URL이 고정되게 (리플레이 og와 같은 이유) */
export const challengeImagePath = (scoreId: number | string) => `/games/tetris/challenge/${scoreId}/og`;

const CHALLENGE_BOARD = /^challenge-([1-9]\d{0,14})$/;

/** 세션 boardKey(challenge-{원본 id}) → 원본 기록 id */
export function challengeRootId(boardKey: string | undefined): number | null {
  const match = boardKey ? CHALLENGE_BOARD.exec(boardKey) : null;
  return match ? Number(match[1]) : null;
}

/** "{이름}님의 12,340점에 도전!" */
export function challengeHeadline(original: Pick<ScoreSummary<TetrisScoreDetail>, 'playerName' | 'score'>): string {
  return `${original.playerName}님의 ${formatScore(original.score)}점에 도전!`;
}

const FALLBACK = {
  title: '테트리스 도전장',
  description: '같은 블록 순서로 겨루는 테트리스 도전장 — 기록을 넘어 보세요.',
};

/**
 * 도전장 공유 — 원본 기록을 내건다. myScore가 있으면(도전한 뒤 다시 공유) 내 점수도 문구에
 * 링크는 원본 기준(같은 도전장 보드로 모이게)
 */
export function buildChallengeShareContent(original: ScoreSummary<TetrisScoreDetail>, myScore: number | null): ShareContent {
  const headline = challengeHeadline(original);
  const text = myScore === null ? `${headline} 같은 블록 순서로 겨뤄 봐요.` : `내 점수 ${formatScore(myScore)}점 — ${headline} 너도 해 볼래?`;
  return {
    url: absoluteUrl(challengePath(original.scoreId)),
    title: headline,
    text,
    kakao: { title: headline, description: `${tetrisStatLine(original.detail)} — 같은 블록 순서로 겨뤄 보세요`, imageUrl: absoluteUrl(challengeImagePath(original.scoreId)) },
  };
}

/** 미리보기 카드 — 한글 폰트가 없으면(korean=false) ASCII만 */
export function buildChallengeCard(summary: ScoreSummary<TetrisScoreDetail> | null, korean: boolean): ReplayCard {
  if (!summary) {
    return { eyebrow: korean ? '테트리스 도전장' : 'TETRIS CHALLENGE', name: null, score: null, scoreUnit: '', stats: korean ? FALLBACK.description : 'Same pieces. Beat the score.', footer: SITE_CONFIG.name };
  }
  return {
    eyebrow: korean ? '테트리스 도전장 · 이 점수에 도전!' : 'TETRIS CHALLENGE · BEAT THIS',
    name: korean || isAscii(summary.playerName) ? summary.playerName : null,
    score: formatScore(summary.score),
    scoreUnit: korean ? '점' : 'PTS',
    stats: korean ? `${tetrisStatLine(summary.detail)} · 같은 블록 순서로 겨뤄 보세요` : `${summary.detail.lines} LINES · LV ${summary.detail.level}`,
    footer: SITE_CONFIG.name,
  };
}

/** 도전장 링크 미리보기 메타 — 플레이 화면이라 noindex, og:image는 고정 경로 */
export function buildChallengeMetadata(rawScoreId: string, summary: ScoreSummary<TetrisScoreDetail> | null): Metadata {
  const path = challengePath(rawScoreId);
  const title = summary ? challengeHeadline(summary) : FALLBACK.title;
  const description = summary ? `${tetrisStatLine(summary.detail)} — 같은 블록 순서로 이 점수를 넘어 보세요.` : FALLBACK.description;
  const image = { url: challengeImagePath(rawScoreId), ...OG_SIZE, alt: FALLBACK.title };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: path },
    openGraph: { url: path, type: 'website', locale: SITE_CONFIG.locale, siteName: SITE_CONFIG.name, title: `${title} | ${SITE_CONFIG.name}`, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
