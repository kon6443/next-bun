"use client";

import { useState } from "react";
import Script from "next/script";
import { KAKAO_JS_KEY, KAKAO_SDK_INTEGRITY, KAKAO_SDK_SRC, initKakao } from "../lib/kakao";

/**
 * 카카오 SDK 상태 — off: 키 없음(빌드에 미주입, 버튼 없음) · loading: 받는 중 · ready: 공유 가능 · failed: 로드·초기화 실패
 * 공유 메뉴가 loading이면 자리를 잡은 비활성 버튼, failed면 안내 한 줄을 보인다 (games-polish FE-49)
 */
export type KakaoStatus = "off" | "loading" | "ready" | "failed";

/**
 * 카카오 SDK — 공유 버튼이 있는 화면에서만 늦게 로드한다. 반환한 kakaoScript를 화면에 렌더해야 로드가 시작된다
 */
export function useKakaoReady(): { kakao: KakaoStatus; kakaoScript: React.ReactNode } {
  const [kakao, setKakao] = useState<KakaoStatus>(KAKAO_JS_KEY ? "loading" : "off");
  const onLoaded = () => setKakao(initKakao(KAKAO_JS_KEY) ? "ready" : "failed");
  const kakaoScript = KAKAO_JS_KEY ? (
    <Script
      src={KAKAO_SDK_SRC}
      integrity={KAKAO_SDK_INTEGRITY}
      crossOrigin="anonymous"
      strategy="lazyOnload"
      // 로딩 중에 다시 마운트되면 next/script는 onReady 없이 onLoad만 부른다 — 둘 다에서 init (isInitialized 가드로 한 번만)
      onLoad={onLoaded}
      onReady={onLoaded}
      onError={() => setKakao("failed")}
    />
  ) : null;
  return { kakao, kakaoScript };
}
