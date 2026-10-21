import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadKoreanFont } from './ogFont';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadKoreanFont', () => {
  it('글자 subset CSS의 truetype 주소로 폰트를 받는다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("@font-face { src: url(https://fonts.gstatic.com/x.ttf) format('truetype'); }"))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const font = await loadKoreanFont('홍길동 12점');
    expect(font?.byteLength).toBe(3);
    expect(fetchMock.mock.calls[0][0]).toContain(`text=${encodeURIComponent('홍길동 12점')}`);
    expect(fetchMock.mock.calls[1][0]).toBe('https://fonts.gstatic.com/x.ttf');
  });

  it('네트워크 실패·형식 불일치·HTTP 오류는 null (ASCII 카드로 폴백)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    expect(await loadKoreanFont('가')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response("src: url(x.woff2) format('woff2')")));
    expect(await loadKoreanFont('가')).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    expect(await loadKoreanFont('가')).toBeNull();
  });
});
