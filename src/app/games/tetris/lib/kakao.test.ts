// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { initKakao, sendKakaoFeed } from './kakao';

const makeKakao = (initialized = false) => {
  let ready = initialized;
  return {
    init: vi.fn(() => {
      ready = true;
    }),
    isInitialized: vi.fn(() => ready),
    Share: { sendDefault: vi.fn() },
  };
};

afterEach(() => {
  delete window.Kakao;
});

describe('카카오 SDK', () => {
  it('SDK·키가 없으면 false (버튼 숨김)', () => {
    expect(initKakao('key')).toBe(false);
    window.Kakao = makeKakao();
    expect(initKakao('')).toBe(false);
  });

  it('이미 초기화됐으면 다시 init하지 않는다', () => {
    const kakao = makeKakao(true);
    window.Kakao = kakao;
    expect(initKakao('key')).toBe(true);
    expect(kakao.init).not.toHaveBeenCalled();
  });

  it('init이 던지면 false — 에러를 밖으로 내지 않는다', () => {
    const kakao = makeKakao();
    kakao.init.mockImplementation(() => {
      throw new Error('invalid key');
    });
    window.Kakao = kakao;
    expect(initKakao('bad')).toBe(false);
  });

  it('피드 카드: 이미지·링크·버튼', () => {
    const kakao = makeKakao(true);
    window.Kakao = kakao;
    expect(sendKakaoFeed({ title: 't', description: 'd', imageUrl: 'https://x/og', url: 'https://x/r/1' })).toBe(true);
    expect(kakao.Share.sendDefault).toHaveBeenCalledWith({
      objectType: 'feed',
      content: { title: 't', description: 'd', imageUrl: 'https://x/og', link: { mobileWebUrl: 'https://x/r/1', webUrl: 'https://x/r/1' } },
      buttons: [{ title: '리플레이 보기', link: { mobileWebUrl: 'https://x/r/1', webUrl: 'https://x/r/1' } }],
    });
    kakao.Share.sendDefault.mockImplementation(() => {
      throw new Error('x');
    });
    expect(sendKakaoFeed({ title: 't', description: 'd', imageUrl: 'i', url: 'u' })).toBe(false);
  });
});
