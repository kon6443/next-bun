import { describe, it, expect } from 'vitest';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import { buildChallengeCard, buildChallengeMetadata, buildChallengeShareContent, challengeHeadline, challengePath, challengeRootId } from './challenge';

const original = { rank: 2, scoreId: 41, playerName: '테트왕', score: 12340, detail: { lines: 40, level: 5, pieces: 0, tSpins: 0, maxCombo: 0, tetrises: 0, engineVersion: 1, das: 10, arr: 2 }, durationMs: 60_000, createdAt: 'x' };

describe('테트리스 도전장 (games-growth B2)', () => {
  it('세션 boardKey challenge-{원본 id} → 원본 id, 형식이 아니면 null', () => {
    expect(challengeRootId('challenge-41')).toBe(41);
    expect(challengeRootId('challenge-0')).toBeNull();
    expect(challengeRootId('default')).toBeNull();
    expect(challengeRootId(undefined)).toBeNull();
  });

  it('제목 — "{이름}님의 {점수}점에 도전!"', () => {
    expect(challengeHeadline(original)).toBe('테트왕님의 12,340점에 도전!');
  });

  it('공유 — 링크·카드는 원본 기준, 도전한 뒤면 내 점수를 문구에', () => {
    const before = buildChallengeShareContent(original, null);
    expect(before.url).toBe(`${SITE_CONFIG.url}${challengePath(41)}`);
    expect(before.text).toBe('테트왕님의 12,340점에 도전! 같은 블록 순서로 겨뤄 봐요.');
    expect(before.kakao.imageUrl).toBe(`${SITE_CONFIG.url}/games/tetris/challenge/41/og`);
    expect(buildChallengeShareContent(original, 9000).text).toBe('내 점수 9,000점 — 테트왕님의 12,340점에 도전! 너도 해 볼래?');
  });

  it('링크 미리보기 — 도전장 제목·고정 og 이미지, 플레이 화면이라 noindex', () => {
    const meta = buildChallengeMetadata('41', original);
    expect(meta.title).toBe('테트왕님의 12,340점에 도전!');
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.alternates?.canonical).toBe('/games/tetris/challenge/41');
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/games/tetris/challenge/41/og' })]);
    expect(buildChallengeMetadata('41', null).title).toBe('테트리스 도전장');
  });

  it('미리보기 카드 — 한글 폰트가 없으면 ASCII만(한글 이름은 뺀다)', () => {
    expect(buildChallengeCard(original, true)).toMatchObject({ name: '테트왕', score: '12,340', scoreUnit: '점' });
    const ascii = buildChallengeCard(original, false);
    expect(ascii.name).toBeNull();
    expect(ascii.eyebrow).toBe('TETRIS CHALLENGE · BEAT THIS');
  });
});
