/**
 * 기록 미리보기 카드(OG 이미지) 문구 공통 — 한글 폰트를 못 받으면 ASCII만으로 그린다
 * (next/og 기본 폰트는 라틴 전용이라, 한글이 있으면 렌더 중 외부 폰트를 받으러 가고 실패하면 이미지가 깨진다)
 * 문구는 게임별 공유 사양(shareSpec.card)이 만든다. 렌더는 ogCard.tsx(서버 전용)
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

export const isAscii = (text: string) => /^[\x20-\x7e]*$/.test(text);

/** 폰트 subset 요청에 넣을 글자 — 카드에 그리는 모든 문자 */
export function cardText(card: ReplayCard): string {
  return [card.eyebrow, card.name ?? '', card.score ?? '', card.scoreUnit, card.stats, card.footer].join('');
}

/** 한글 카드에 ASCII 밖 글자가 있으면 한글 폰트가 필요하다 */
export function needsKoreanFont(koreanCard: ReplayCard): boolean {
  return !isAscii(cardText(koreanCard));
}
