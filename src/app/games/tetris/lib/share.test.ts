import { describe, it, expect, vi, afterEach } from 'vitest';
import { SITE_CONFIG } from '@/app/config/siteConfig';
import { buildShareText, canWebShare, copyText, parseScoreId, replayImageUrl, replayUrl, webShare } from './share';
import { buildReplayCard, cardText, needsKoreanFont } from './replayCard';

const target = { scoreId: 12, playerName: '테트리스왕', score: 12340, detail: { lines: 40, level: 5 } };
const summary = { rank: 3, scoreId: 12, playerName: '테트리스왕', score: 12340, detail: { lines: 40, level: 5, pieces: 1, tSpins: 0, tetrises: 0, maxCombo: 0, engineVersion: 1, das: 10, arr: 2 }, durationMs: 83000, createdAt: 'x' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('공유 URL·문구 (DESIGN §2)', () => {
  it('scoreId는 양의 정수만', () => {
    expect(parseScoreId('12')).toBe(12);
    for (const bad of ['0', '-1', '1.5', 'abc', '012', '1'.repeat(16)]) expect(parseScoreId(bad)).toBeNull();
  });

  it('절대 URL·쿼리 없음, 이미지는 기록 OG', () => {
    expect(replayUrl(12)).toBe(`${SITE_CONFIG.url}/games/tetris/replays/12`);
    expect(replayImageUrl(12)).toBe(`${SITE_CONFIG.url}/games/tetris/replays/12/og`);
  });

  it('공유 문구', () => {
    expect(buildShareText(target)).toBe('테트리스왕님의 테트리스 12,340점 (40줄 · 레벨 5) — 리플레이 보기');
  });
});

describe('클립보드·Web Share', () => {
  it('복사 성공·실패·미지원', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    expect(await copyText('u')).toBe('copied');
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    expect(await copyText('u')).toBe('failed');
    vi.stubGlobal('navigator', {});
    expect(await copyText('u')).toBe('unsupported');
  });

  it('Web Share: 지원 여부, 사용자 취소(AbortError)는 실패가 아니다', async () => {
    vi.stubGlobal('navigator', {});
    expect(canWebShare()).toBe(false);
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    expect(canWebShare()).toBe(true);
    expect(await webShare({ url: 'u' })).toBe('shared');
    share.mockRejectedValueOnce(new DOMException('cancel', 'AbortError'));
    expect(await webShare({ url: 'u' })).toBe('cancelled');
    share.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    expect(await webShare({ url: 'u' })).toBe('failed');
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
    expect(needsKoreanFont(summary)).toBe(true);
    expect(needsKoreanFont(null)).toBe(true);
  });
});
