import { describe, it, expect, vi, afterEach } from 'vitest';
import { canWebShare, copyText, parseScoreId, webShare } from './share';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scoreId 검사', () => {
  it('scoreId는 양의 정수만', () => {
    expect(parseScoreId('12')).toBe(12);
    for (const bad of ['0', '-1', '1.5', 'abc', '012', '1'.repeat(16)]) expect(parseScoreId(bad)).toBeNull();
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
