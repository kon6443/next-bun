import { describe, it, expect } from 'vitest';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import { absoluteUrl, buildShareContent, buildShareText } from '@/app/games/_shared/lib/shareSpec';
import { cardText, needsKoreanFont } from '@/app/games/_shared/lib/replayCard';
import { TETRIS_SHARE } from './share';
import { buildReplayCard, tetrisRankLabel } from './replayCard';

const summary = { rank: 3, scoreId: 12, playerName: '테트리스왕', score: 12340, detail: { lines: 40, level: 5, pieces: 1, tSpins: 0, tetrises: 0, maxCombo: 0, engineVersion: 1, das: 10, arr: 2 }, durationMs: 83000, createdAt: 'x' };

describe('공유 URL·문구 (DESIGN §2)', () => {
  it('절대 URL·쿼리 없음, 이미지는 기록 OG', () => {
    expect(absoluteUrl(TETRIS_SHARE.replayPath(12))).toBe(`${SITE_CONFIG.url}/games/tetris/replays/12`);
    expect(absoluteUrl(TETRIS_SHARE.imagePath(12))).toBe(`${SITE_CONFIG.url}/games/tetris/replays/12/og`);
  });

  it('공유 문구', () => {
    expect(buildShareText(TETRIS_SHARE, summary)).toBe('테트리스왕님의 테트리스 12,340점 (40줄 · 레벨 5) — 리플레이 보기');
  });

  it('공유 메뉴 내용 — 카카오 카드 제목·설명·이미지, Web Share 제목·본문 (공용화 전 문구 그대로)', () => {
    expect(buildShareContent(TETRIS_SHARE, summary)).toEqual({
      url: `${SITE_CONFIG.url}/games/tetris/replays/12`,
      title: '테트리스왕님의 테트리스 12,340점',
      text: '테트리스왕님의 테트리스 12,340점 (40줄 · 레벨 5) — 리플레이 보기',
      kakao: {
        title: '테트리스왕님의 테트리스 12,340점',
        description: '40줄 · 레벨 5 — 리플레이로 플레이를 다시 보세요',
        imageUrl: `${SITE_CONFIG.url}/games/tetris/replays/12/og`,
      },
    });
  });
});

describe('미리보기 카드 문구', () => {
  it('한글 폰트가 있으면 한글, 없으면 ASCII만 (한글 이름은 숨김)', () => {
    expect(buildReplayCard(summary, true)).toMatchObject({ name: '테트리스왕', score: '12,340', scoreUnit: '점', stats: '40줄 · 레벨 5 · 1:23' });
    const ascii = buildReplayCard(summary, false);
    expect(ascii).toMatchObject({ name: null, scoreUnit: 'PTS', stats: '40 LINES · LV 5 · 1:23', eyebrow: 'TETRIS REPLAY · #3' });
    // next/og 기본 폰트(라틴)로 그릴 수 있는 문자만 — 구분점 ·(U+00B7)은 Latin-1이라 포함된다(오프라인 렌더로 확인)
    expect(cardText(ascii)).toMatch(/^[\x20-\x7e·]*$/);
  });

  it('영문 이름은 ASCII 카드에도 나온다', () => {
    expect(buildReplayCard({ ...summary, playerName: 'Neo_1' }, false).name).toBe('Neo_1');
  });

  it('기록이 없으면 일반 카드, 폰트 필요 여부', () => {
    expect(buildReplayCard(null, false)).toMatchObject({ eyebrow: 'TETRIS', name: null, score: null });
    expect(needsKoreanFont(buildReplayCard(summary, true))).toBe(true);
    expect(needsKoreanFont(buildReplayCard(null, true))).toBe(true);
  });
});

describe('보드별 순위 문구 — 데일리·도전장 기록은 그 보드 순위로 (games-growth B1·B2)', () => {
  it('미리보기 설명·카드 머리말이 머리줄과 같은 표현', () => {
    expect(tetrisRankLabel(undefined, 3)).toBe('전체 3위');
    expect(tetrisRankLabel('default', 3)).toBe('전체 3위');
    expect(tetrisRankLabel('daily-2026-10-24', 3)).toBe('10/24 데일리 3위');
    expect(tetrisRankLabel('challenge-7', 2)).toBe('도전장 2위');
    expect(TETRIS_SHARE.metaDescription({ ...summary, boardKey: 'daily-2026-10-24' })).toContain('· 10/24 데일리 3위 —');
    expect(buildReplayCard({ ...summary, boardKey: 'challenge-7' }, true).eyebrow).toBe('테트리스 리플레이 · 도전장 3위');
    expect(buildReplayCard(summary, true).eyebrow).toBe('테트리스 리플레이 · 전체 3위');
  });
});
