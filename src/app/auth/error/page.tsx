"use client";

import type { CSSProperties } from "react";
import { Suspense, useEffect } from "react";
import { useSafeNavigation } from "@/app/hooks";
import { clearAuthLoading } from "@/app/components/AuthLoadingOverlay";

function AuthErrorContent() {
  const { getParam } = useSafeNavigation();
  const error = getParam("error");

  // 에러 페이지 진입 시 로딩 플래그 제거 (무한 로딩 방지)
  useEffect(() => {
    clearAuthLoading();
  }, []);

  const getErrorMessage = () => {
    switch (error) {
      case "OAuthCallback":
        return {
          title: "카카오 로그인 오류",
          message: "카카오 로그인 처리 중 문제가 발생했습니다.",
          detail: "카카오 API 요청 제한이 초과되었을 수 있습니다. 잠시 후 다시 시도해주세요.",
          tip: "계속 실패할 경우, 카카오톡 앱 또는 카카오 웹사이트에서 로그아웃 후 다시 시도해주세요.",
        };
      case "OAuthSignin":
        return {
          title: "로그인 오류",
          message: "로그인 요청을 시작하는데 실패했습니다.",
          detail: "잠시 후 다시 시도해주세요.",
          tip: null,
        };
      case "OAuthCreateAccount":
        return {
          title: "계정 생성 오류",
          message: "계정을 생성하는데 실패했습니다.",
          detail: "잠시 후 다시 시도해주세요.",
          tip: null,
        };
      case "EmailCreateAccount":
        return {
          title: "이메일 계정 생성 오류",
          message: "이메일 계정을 생성하는데 실패했습니다.",
          detail: "잠시 후 다시 시도해주세요.",
          tip: null,
        };
      case "Callback":
        return {
          title: "콜백 오류",
          message: "인증 콜백 처리 중 문제가 발생했습니다.",
          detail: "잠시 후 다시 시도해주세요.",
          tip: "계속 실패할 경우, 카카오톡 앱 또는 카카오 웹사이트에서 로그아웃 후 다시 시도해주세요.",
        };
      case "OAuthAccountNotLinked":
        return {
          title: "계정 연결 오류",
          message: "이미 다른 방법으로 가입된 이메일입니다.",
          detail: "다른 로그인 방법을 사용해주세요.",
          tip: null,
        };
      case "EmailSignin":
        return {
          title: "이메일 로그인 오류",
          message: "이메일을 전송하는데 실패했습니다.",
          detail: "잠시 후 다시 시도해주세요.",
          tip: null,
        };
      case "CredentialsSignin":
        return {
          title: "로그인 정보 오류",
          message: "이메일 또는 비밀번호가 올바르지 않습니다.",
          detail: "다시 확인해주세요.",
          tip: null,
        };
      case "SessionRequired":
        return {
          title: "세션 오류",
          message: "로그인이 필요합니다.",
          detail: "로그인 후 다시 시도해주세요.",
          tip: null,
        };
      default:
        return {
          title: "인증 오류",
          message: "로그인 처리 중 문제가 발생했습니다.",
          detail: "잠시 후 다시 시도해주세요.",
          tip: null,
        };
    }
  };

  const errorInfo = getErrorMessage();

  return (
    <div style={containerStyle}>
      <section style={cardStyle}>
        <div style={iconWrapStyle}>
          <span style={iconStyle}>⚠️</span>
        </div>
        <p style={eyebrowStyle}>오류 발생</p>
        <h1 style={titleStyle}>{errorInfo.title}</h1>
        <p style={descriptionStyle}>{errorInfo.message}</p>
        <p style={{ ...detailStyle, marginBottom: errorInfo.tip ? "0.75rem" : "1.85rem" }}>{errorInfo.detail}</p>
        {errorInfo.tip && <p style={tipStyle}>{errorInfo.tip}</p>}
        <div style={buttonGroupStyle}>
          <button
            style={kakaoButtonStyle}
            onClick={() => (window.location.href = "/auth/signin")}
          >
            <span style={{ fontSize: "1.25rem", marginRight: 8 }}>💬</span>
            로그인 페이지로 돌아가기
          </button>
          <button
            style={secondaryButtonStyle}
            onClick={() => (window.location.href = "/")}
          >
            홈으로 돌아가기
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={
      <div style={containerStyle}>
        <section style={cardStyle}>
          <p style={{ color: "#6b7280" }}>로딩 중...</p>
        </section>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}

const containerStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
  background:
    "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.28), transparent 55%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.2), transparent 60%), var(--background)",
};

const cardStyle: CSSProperties = {
  width: "min(430px, 100%)",
  background:
    "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(15,23,42,0.75))",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: "28px",
  padding: "2.75rem",
  boxShadow:
    "0 35px 65px rgba(2,6,23,0.75), inset 0 1px 0 rgba(255,255,255,0.05)",
  textAlign: "center",
};

const iconWrapStyle: CSSProperties = {
  width: 80,
  height: 80,
  margin: "0 auto 1rem",
  borderRadius: "9999px",
  background:
    "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.2))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const iconStyle: CSSProperties = {
  fontSize: "2.25rem",
  fontWeight: 600,
};

const eyebrowStyle: CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.35em",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: "0.5rem",
};

const titleStyle: CSSProperties = {
  fontSize: "2.15rem",
  fontWeight: 700,
  color: "#e2e8f0",
  marginBottom: "0.75rem",
};

const descriptionStyle: CSSProperties = {
  fontSize: "1rem",
  color: "#cbd5f5",
  lineHeight: 1.6,
  marginBottom: "0.5rem",
};

const detailStyle: CSSProperties = {
  fontSize: "0.875rem",
  color: "#94a3b8",
  lineHeight: 1.6,
  marginBottom: "0.75rem",
};

const tipStyle: CSSProperties = {
  fontSize: "0.8rem",
  color: "#fbbf24",
  lineHeight: 1.6,
  marginBottom: "1.85rem",
  padding: "0.75rem",
  background: "rgba(251,191,36,0.1)",
  borderRadius: "8px",
  border: "1px solid rgba(251,191,36,0.2)",
};

const buttonGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const baseButtonStyle: CSSProperties = {
  width: "100%",
  borderRadius: "9999px",
  border: "none",
  padding: "0.95rem 1.25rem",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
  transition:
    "transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.35rem",
};

const kakaoButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: "#FEE500",
  color: "#181600",
  boxShadow: "0 18px 35px rgba(251,191,36,0.35)",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background:
    "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(99,102,241,0.4))",
  color: "#f8fafc",
  boxShadow: "0 18px 35px rgba(59,130,246,0.35)",
};
