"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
// 루트 레이아웃은 모든 페이지에 실리니 배럴(@/app/teams/components)이 아니라 파일을 직접 가져온다 — 배럴에 무거운 화면 컴포넌트가 늘어도 딸려 오지 않게
import { BarLoader } from "@/app/teams/components/LoadingSpinner";

// sessionStorage 키
export const AUTH_LOADING_KEY = "auth_loading";

// 타임아웃 시간 (30초)
const LOADING_TIMEOUT_MS = 30000;

/**
 * 로딩 플래그 제거 유틸리티
 */
export function clearAuthLoading() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(AUTH_LOADING_KEY);
  }
}

/**
 * 전역 인증 로딩 오버레이
 * - sessionStorage의 auth_loading 플래그를 체크하여 로딩 UI 표시
 * - 로그인 세션이 생성되면 자동으로 플래그 제거
 * - 30초 타임아웃 후 자동 해제 (무한 로딩 방지)
 * - 취소 버튼으로 수동 해제 가능
 */
export function AuthLoadingOverlay() {
  const { status } = useSession();
  // hydration mismatch 방지를 위한 마운트 상태
  const [hasMounted, setHasMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 로딩 해제 함수
  const cancelLoading = useCallback(() => {
    clearAuthLoading();
    setIsLoading(false);
  }, []);

  // 마운트 시 즉시 sessionStorage 체크
  useEffect(() => {
    setHasMounted(true);
    const flag = sessionStorage.getItem(AUTH_LOADING_KEY);
    if (flag === "true") {
      setIsLoading(true);
    }
  }, []);

  // 타임아웃: 30초 후 자동으로 로딩 해제 (무한 로딩 방지)
  useEffect(() => {
    if (!isLoading) return;

    const timeoutId = setTimeout(() => {
      console.warn("[AuthLoadingOverlay] 로딩 타임아웃 - 자동 해제");
      cancelLoading();
    }, LOADING_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [isLoading, cancelLoading]);

  // 세션 상태 변경 시 체크
  useEffect(() => {
    if (!hasMounted) return;
    
    const loadingFlag = sessionStorage.getItem(AUTH_LOADING_KEY);
    
    if (loadingFlag === "true") {
      // authenticated가 되면 로딩 종료
      if (status === "authenticated") {
        cancelLoading();
      }
      // unauthenticated 상태가 되면 (로그인 취소/실패) 로딩 종료
      // 단, 처음 마운트 시 unauthenticated일 수 있으므로 약간의 딜레이 후 체크
      if (status === "unauthenticated") {
        const checkTimer = setTimeout(() => {
          const stillLoading = sessionStorage.getItem(AUTH_LOADING_KEY) === "true";
          if (stillLoading) {
            cancelLoading();
          }
        }, 2000); // 2초 후에도 unauthenticated면 취소
        return () => clearTimeout(checkTimer);
      }
    }
  }, [status, hasMounted, cancelLoading]);

  // 마운트 전이거나 로딩 중이 아니면 렌더링하지 않음
  if (!hasMounted || !isLoading) return null;

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={avatarWrapStyle}>
          <span style={{ ...avatarStyle, animation: "pulse 1.5s ease-in-out infinite" }}>
            💬
          </span>
        </div>
        <p style={eyebrowStyle}>카카오 로그인</p>
        <h1 style={titleStyle}>로그인 중...</h1>
        <BarLoader barCount={5} barHeight="32px" />
        {/* 취소 버튼 */}
        <button
          onClick={cancelLoading}
          style={cancelButtonStyle}
        >
          취소
        </button>
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
          }
        `}</style>
      </div>
    </div>
  );
}

// 스타일 정의
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background:
    "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.28), transparent 55%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.2), transparent 60%), var(--background, #0f172a)",
};

const cardStyle: React.CSSProperties = {
  width: "min(430px, 90%)",
  background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.75))",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: "28px",
  padding: "2.75rem",
  boxShadow: "0 35px 65px rgba(2,6,23,0.75), inset 0 1px 0 rgba(255,255,255,0.05)",
  textAlign: "center",
};

const avatarWrapStyle: React.CSSProperties = {
  width: 80,
  height: 80,
  margin: "0 auto 1rem",
  borderRadius: "9999px",
  background: "linear-gradient(135deg, rgba(37,99,235,0.2), rgba(99,102,241,0.2))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const avatarStyle: React.CSSProperties = {
  fontSize: "2.25rem",
  fontWeight: 600,
  color: "#f8fafc",
};

const eyebrowStyle: React.CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.35em",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: "0.5rem",
};

const titleStyle: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: 700,
  color: "#e2e8f0",
  marginBottom: "1.5rem",
};

const cancelButtonStyle: React.CSSProperties = {
  marginTop: "1.5rem",
  padding: "0.75rem 2rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#94a3b8",
  background: "transparent",
  border: "1px solid rgba(148,163,184,0.3)",
  borderRadius: "9999px",
  cursor: "pointer",
  transition: "all 0.2s ease",
};
