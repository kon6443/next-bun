import type { Metadata } from 'next';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import type { BattleMatch, BattleMatchPlayer } from '@/services/tetrisBattleService';
import { OG_SIZE, isAscii } from '@/app/games/_shared/lib/replayCard';
import { type ShareContent, absoluteUrl } from '@/app/games/_shared/lib/shareSpec';

/**
 * 대전 경기 공유 문구 (DESIGN §18) — 공유 메뉴·카카오 카드·링크 미리보기 메타·OG 카드
 * 흐름은 기존 리플레이 공유와 같다(_shared ShareMenu·absoluteUrl·OG_SIZE). 경기 단위라 문구·카드 모양만 따로 둔다
 */

export const battleMatchPath = (matchId: string) => `/games/tetris/battle/matches/${matchId}`;
/** route group 밖 고정 route handler (battle/matches/[matchId]/og/route.tsx) — 카카오 카드에 넣을 URL이 고정되게 */
export const battleMatchImagePath = (matchId: string) => `/games/tetris/battle/matches/${matchId}/og`;

const FALLBACK = {
  title: '테트리스 대전 기록',
  description: '친구와 실시간으로 겨루는 테트리스 대전 — 경기를 다시 보세요.',
};

export function battleWinner(match: BattleMatch): BattleMatchPlayer | null {
  return match.players.find((p) => p.place === 1) ?? null;
}

/** "{방 이름} — {우승자}님 우승" */
export function battleHeadline(match: BattleMatch): string {
  const winner = battleWinner(match);
  return winner ? `${match.roomName} — ${winner.name}님 우승` : match.roomName;
}

/** "3인전 · 우승자 2KO" (KO가 없으면 인원만) */
export function battleStatLine(match: BattleMatch): string {
  const winner = battleWinner(match);
  const kos = winner && winner.kos > 0 ? ` · 우승자 ${winner.kos}KO` : '';
  return `${match.playerCount}인전${kos}`;
}

export function buildBattleShareContent(match: BattleMatch): ShareContent {
  const headline = battleHeadline(match);
  const statLine = battleStatLine(match);
  return {
    url: absoluteUrl(battleMatchPath(match.matchId)),
    title: headline,
    text: `${headline} (${statLine}) — 경기 다시 보기`,
    kakao: {
      title: headline,
      description: `${statLine} — 대전을 4분할로 다시 보세요`,
      imageUrl: absoluteUrl(battleMatchImagePath(match.matchId)),
    },
  };
}

/**
 * 링크 미리보기 메타 — 규칙은 _shared buildReplayMetadata와 같다
 * (og:image는 고정 경로 명시 · 조회 실패는 일반 미리보기로 폴백 · noindex)
 */
export function buildBattleMetadata(rawMatchId: string, match: BattleMatch | null): Metadata {
  const path = battleMatchPath(rawMatchId);
  const image = { url: battleMatchImagePath(rawMatchId), ...OG_SIZE, alt: FALLBACK.title };
  const title = match ? `${battleHeadline(match)} | 테트리스 대전` : FALLBACK.title;
  const description = match
    ? `${battleStatLine(match)} · ${match.players.map((p) => `${p.place}위 ${p.name}`).join(' · ')} — 경기를 다시 보세요.`
    : FALLBACK.description;
  return {
    robots: { index: false, follow: false },
    alternates: { canonical: path },
    title,
    description,
    openGraph: {
      url: path,
      type: 'website',
      locale: SITE_CONFIG.locale,
      siteName: SITE_CONFIG.name,
      images: [image],
      title: `${title} | ${SITE_CONFIG.name}`,
      description,
    },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

/** OG 카드 문구 — 한글 폰트가 없으면(korean=false) ASCII만 (next/og 기본 폰트는 라틴 전용) */
export type BattleCard = {
  eyebrow: string;
  /** 방 이름 — ASCII 모드에서 한글이면 null */
  room: string | null;
  /** 큰 글씨 — 우승자 */
  headline: string;
  /** 순위 줄 */
  standings: string;
  footer: string;
};

export function buildBattleCard(match: BattleMatch | null, korean: boolean): BattleCard {
  const footer = 'FiveSouth';
  if (!match) {
    return {
      eyebrow: korean ? '테트리스 대전' : 'TETRIS BATTLE',
      room: null,
      headline: 'TETRIS BATTLE',
      standings: korean ? '친구와 실시간으로 겨루는 테트리스' : 'Real-time Tetris with friends',
      footer,
    };
  }
  const nameOf = (p: BattleMatchPlayer) => (korean || isAscii(p.name) ? p.name : `P${p.place}`);
  const winner = battleWinner(match);
  const kos = winner && winner.kos > 0 ? (korean ? ` · ${winner.kos}KO` : ` · ${winner.kos} KO`) : '';
  return {
    eyebrow: korean ? `테트리스 대전 · ${match.playerCount}인전${kos}` : `TETRIS BATTLE · ${match.playerCount}P${kos}`,
    room: korean || isAscii(match.roomName) ? match.roomName : null,
    headline: winner ? (korean ? `${winner.name} 우승` : `${nameOf(winner)} WINS`) : 'TETRIS BATTLE',
    standings: match.players.map((p) => `${p.place}${korean ? '위' : '.'} ${nameOf(p)}`).join(' · '),
    footer,
  };
}

/** 폰트 subset 요청에 넣을 글자 */
export function battleCardText(card: BattleCard): string {
  return [card.eyebrow, card.room ?? '', card.headline, card.standings, card.footer].join('');
}
