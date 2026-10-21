/**
 * 카카오 JavaScript SDK — 카카오톡 공유(피드 카드)
 *
 * 버전·integrity는 카카오 공식 다운로드 페이지(developers.kakao.com/docs/ko/javascript/download)의 SRI 값 그대로 고정한다.
 * CDN 파일의 sha384를 직접 계산해 같은 값임을 확인했다. 버전을 올릴 때 두 값을 함께 바꾼다.
 */
export const KAKAO_SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.4/kakao.min.js';
export const KAKAO_SDK_INTEGRITY = 'sha384-BGX7Wb16GmRFagri4bLJV2DgipVZaU2AI812GZtHtHzzDQJnfHasDXN5houxv45w';

/** 빌드 때 인라인된다 — 없으면 카카오톡 공유를 숨긴다 (JavaScript 키는 공개 키, 보호는 카카오 앱의 허용 도메인으로) */
export const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? '';

type KakaoLink = { mobileWebUrl: string; webUrl: string };

type KakaoSdk = {
  init: (appKey: string) => void;
  isInitialized: () => boolean;
  Share: {
    sendDefault: (settings: {
      objectType: 'feed';
      content: { title: string; description: string; imageUrl: string; link: KakaoLink };
      buttons: { title: string; link: KakaoLink }[];
    }) => void;
  };
};

declare global {
  interface Window {
    Kakao?: KakaoSdk;
  }
}

/** SDK가 로드된 뒤 부른다 — 이미 초기화됐으면 다시 하지 않는다. 실패하면 false (버튼을 숨긴다) */
export function initKakao(appKey: string): boolean {
  try {
    const kakao = window.Kakao;
    if (!kakao || !appKey) return false;
    if (!kakao.isInitialized()) kakao.init(appKey);
    return kakao.isInitialized();
  } catch {
    return false;
  }
}

export function sendKakaoFeed(args: { title: string; description: string; imageUrl: string; url: string }): boolean {
  try {
    const kakao = window.Kakao;
    if (!kakao?.isInitialized()) return false;
    const link = { mobileWebUrl: args.url, webUrl: args.url };
    kakao.Share.sendDefault({
      objectType: 'feed',
      content: { title: args.title, description: args.description, imageUrl: args.imageUrl, link },
      buttons: [{ title: '리플레이 보기', link }],
    });
    return true;
  } catch {
    return false;
  }
}
