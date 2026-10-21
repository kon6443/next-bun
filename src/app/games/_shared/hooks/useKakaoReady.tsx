"use client";

import { useState } from "react";
import Script from "next/script";
import { KAKAO_JS_KEY, KAKAO_SDK_INTEGRITY, KAKAO_SDK_SRC, initKakao } from "../lib/kakao";

/**
 * 카카오 SDK — 공유 버튼이 있는 화면에서만 늦게 로드한다. 반환한 kakaoScript를 화면에 렌더해야 로드가 시작된다
 * 키가 없으면(빌드에 미주입) 스크립트를 넣지 않고 kakaoReady는 계속 false — 공유 메뉴가 카카오톡 버튼을 숨긴다
 */
export function useKakaoReady(): { kakaoReady: boolean; kakaoScript: React.ReactNode } {
  const [kakaoReady, setKakaoReady] = useState(false);
  const kakaoScript = KAKAO_JS_KEY ? (
    <Script
      src={KAKAO_SDK_SRC}
      integrity={KAKAO_SDK_INTEGRITY}
      crossOrigin="anonymous"
      strategy="lazyOnload"
      // 로딩 중에 다시 마운트되면 next/script는 onReady 없이 onLoad만 부른다 — 둘 다에서 init (isInitialized 가드로 한 번만)
      onLoad={() => setKakaoReady(initKakao(KAKAO_JS_KEY))}
      onReady={() => setKakaoReady(initKakao(KAKAO_JS_KEY))}
      onError={() => setKakaoReady(false)}
    />
  ) : null;
  return { kakaoReady, kakaoScript };
}
