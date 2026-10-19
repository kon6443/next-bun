"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { startKakaoLogin, type KakaoLoginOptions } from "./shared";

/**
 * 로그인 버튼용 — 누르는 즉시 비활성화·로딩 표시, 시작이 실패하거나 뒤로가기로 돌아오면 다시 활성화
 */
export function useKakaoLogin() {
  const [isStarting, setIsStarting] = useState(false);

  // 카카오로 넘어갔다가 뒤로가기로 bfcache 에서 복원되면 버튼이 "시작 중"으로 남는다 — 풀어 준다
  // (잠금 자체는 shared.ts 의 모듈 리스너가 푼다)
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsStarting(false);
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const start = useCallback(async (options?: KakaoLoginOptions) => {
    setIsStarting(true);
    try {
      // 다른 버튼이 이미 시작했으면 false — 그 흐름이 화면을 넘기므로 이 버튼도 시작 중으로 둔다
      await startKakaoLogin(options);
    } catch (error) {
      console.error("Failed to start Kakao login:", error);
      setIsStarting(false);
      toast.error("로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }, []);

  return { start, isStarting };
}
