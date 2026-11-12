import type { Metadata } from 'next';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import type { FortressMatch, FortressMatchPlayer } from '@/services/fortressService';
import { OG_SIZE, isAscii } from '@/app/games/_shared/lib/replayCard';
import { type ShareContent, absoluteUrl } from '@/app/games/_shared/lib/shareSpec';
import { TEAM_LABEL } from './roomLabels';

/**
 * 포트리스 경기 공유 문구 (F6, DESIGN §12) — 공유 메뉴·카카오 카드·링크 미리보기 메타·OG 카드
 * 테트리스 대전 공유(battleShare.ts)와 같은 흐름 — 결과 모양(팀 승리·무승부)만 포트리스에 맞춘다
 */

export const fortressMatchPath = (matchId: string) => `/games/fortress/battle/matches/${matchId}`;
/** route group 밖 고정 route handler (battle/matches/[matchId]/og/route.tsx) — 카카오 카드에 넣을 URL이 고정되게 */
export const fortressMatchImagePath = (matchId: string) => `/games/fortress/battle/matches/${matchId}/og`;
export const FORTRESS_MATCHES_PATH = '/games/fortress/battle/matches';

const FALLBACK = {
  title: '포트리스 경기 기록',
  description: '바람을 읽고 쏘는 턴제 포격전 — 친구와 겨룬 경기를 다시 보세요.',
};

type ResultLike = Pick<FortressMatch, 'mode' | 'result' | 'playerCount' | 'turns'> & { players: Pick<FortressMatchPlayer, 'name' | 'place' | 'team'>[] };

/** 결과 한 줄 — 팀 승리 "주황 팀 승리" · 개인전 "가나님 우승"(공동 1위면 "가나·다라 공동 1위") · 무승부 */
export function fortressResultHeadline(match: ResultLike): string {
  if (match.result.kind === 'draw') return '무승부';
  if (match.mode === 'team' && match.result.team !== null) return `${TEAM_LABEL[match.result.team]} 승리`;
  const firsts = match.players.filter((p) => p.place === 1);
  if (firsts.length === 1) return `${firsts[0].name}님 우승`;
  if (firsts.length > 1) return `${firsts.map((p) => p.name).join('·')} 공동 1위`;
  return '경기 끝';
}

/** "4인 팀전 · 120턴" */
export function fortressStatLine(match: Pick<FortressMatch, 'mode' | 'playerCount' | 'turns'>): string {
  return `${match.playerCount}인 ${match.mode === 'team' ? '팀전' : '개인전'} · ${match.turns}턴`;
}

/** "{방 이름} — {결과}" (방 이름이 없으면 결과만) */
export function fortressHeadline(match: Pick<FortressMatch, 'roomName'> & ResultLike): string {
  const result = fortressResultHeadline(match);
  return match.roomName ? `${match.roomName} — ${result}` : result;
}

export function buildFortressShareContent(match: FortressMatch): ShareContent {
  const headline = fortressHeadline(match);
  const statLine = fortressStatLine(match);
  return {
    url: absoluteUrl(fortressMatchPath(match.matchId)),
    title: headline,
    text: `${headline} (${statLine}) — 포트리스 경기 다시 보기`,
    kakao: {
      title: headline,
      description: `${statLine} — 포격전을 처음부터 다시 보세요`,
      imageUrl: absoluteUrl(fortressMatchImagePath(match.matchId)),
    },
  };
}

/**
 * 링크 미리보기 메타 — 테트리스 대전 메타와 같은 규칙
 * (og:image는 고정 경로 명시 · 조회 실패는 일반 미리보기로 폴백 · noindex — 개별 경기는 얇은 캔버스 페이지)
 */
export function buildFortressMetadata(rawMatchId: string, match: FortressMatch | null): Metadata {
  const path = fortressMatchPath(rawMatchId);
  const image = { url: fortressMatchImagePath(rawMatchId), ...OG_SIZE, alt: FALLBACK.title };
  const title = match ? `${fortressHeadline(match)} | 포트리스` : FALLBACK.title;
  const description = match
    ? `${fortressStatLine(match)} · ${match.players.map((p) => `${p.place}위 ${p.name}`).join(' · ')} — 경기를 다시 보세요.`
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
export type FortressCard = {
  eyebrow: string;
  /** 방 이름 — ASCII 모드에서 한글이면 null */
  room: string | null;
  headline: string;
  standings: string;
  footer: string;
};

export function buildFortressCard(match: FortressMatch | null, korean: boolean): FortressCard {
  const footer = 'FiveSouth';
  if (!match) {
    return {
      eyebrow: korean ? '포트리스' : 'FORTRESS',
      room: null,
      headline: 'FORTRESS',
      standings: korean ? '바람을 읽고 쏘는 턴제 포격전' : 'Turn-based artillery with friends',
      footer,
    };
  }
  const nameOf = (p: FortressMatchPlayer) => (korean || isAscii(p.name) ? p.name : `P${p.slot + 1}`);
  const asciiHeadline = () => {
    if (match.result.kind === 'draw') return 'DRAW';
    if (match.mode === 'team' && match.result.team !== null) return `${match.result.team === 0 ? 'BLUE' : 'ORANGE'} TEAM WINS`;
    const firsts = match.players.filter((p) => p.place === 1);
    if (firsts.length > 1) return `${firsts.map(nameOf).join(' & ')} TIE`;
    return firsts.length === 1 ? `${nameOf(firsts[0])} WINS` : 'FORTRESS';
  };
  return {
    eyebrow: korean ? `포트리스 · ${fortressStatLine(match)}` : `FORTRESS · ${match.playerCount}P ${match.mode === 'team' ? 'TEAM' : 'FFA'} · ${match.turns} TURNS`,
    room: match.roomName && (korean || isAscii(match.roomName)) ? match.roomName : null,
    headline: korean ? fortressResultHeadline(match) : asciiHeadline(),
    standings: match.players.map((p) => `${p.place}${korean ? '위' : '.'} ${nameOf(p)}`).join(' · '),
    footer,
  };
}

/** 폰트 subset 요청에 넣을 글자 */
export function fortressCardText(card: FortressCard): string {
  return [card.eyebrow, card.room ?? '', card.headline, card.standings, card.footer].join('');
}
