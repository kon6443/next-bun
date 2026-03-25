"use client";

import type { CSSProperties } from "react";
import { Suspense, useEffect } from "react";
import { useSafeNavigation } from "@/app/hooks";
import { clearAuthLoading } from "@/app/components/AuthLoadingOverlay";
import {
  startKakaoLogin,
  authContainerStyle,
  authCardStyle,
  authBaseButtonStyle,
  authKakaoButtonStyle,
  authEyebrowStyle,
  authTitleStyle,
} from "../shared";

interface ErrorInfo {
  title: string;
  message: string;
  detail: string;
  tip: string | null;
}

const ERROR_MAP: Record<string, ErrorInfo> = {
  OAuthCallback: {
    title: "카카오 로그인 오류",
    message: "카카오 로그인 처리 중 문제가 발생했습니다.",
    detail: "카카오 API 요청 제한이 초과되었을 수 있습니다. 잠시 후 다시 시도해주세요.",
    tip: "계속 실패할 경우, 카카오톡 앱 또는 카카오 웹사이트에서 로그아웃 후 다시 시도해주세요.",
  },
  OAuthSignin: {
    title: "로그인 오류",
    message: "로그인 요청을 시작하는데 실패했습니다.",
    detail: "잠시 후 다시 시도해주세요.",
    tip: null,
  },
  OAuthCreateAccount: {
    title: "계정 생성 오류",
    message: "계정을 생성하는데 실패했습니다.",
    detail: "잠시 후 다시 시도해주세요.",
    tip: null,
  },
  EmailCreateAccount: {
    title: "이메일 계정 생성 오류",
    message: "이메일 계정을 생성하는데 실패했습니다.",
    detail: "잠시 후 다시 시도해주세요.",
    tip: null,
  },
  Callback: {
    title: "콜백 오류",
    message: "인증 콜백 처리 중 문제가 발생했습니다.",
    detail: "잠시 후 다시 시도해주세요.",
    tip: "계속 실패할 경우, 카카오톡 앱 또는 카카오 웹사이트에서 로그아웃 후 다시 시도해주세요.",
  },
  OAuthAccountNotLinked: {
    title: "계정 연결 오류",
    message: "이미 다른 방법으로 가입된 이메일입니다.",
    detail: "다른 로그인 방법을 사용해주세요.",
    tip: null,
  },
  EmailSignin: {
    title: "이메일 로그인 오류",
    message: "이메일을 전송하는데 실패했습니다.",
    detail: "잠시 후 다시 시도해주세요.",
    tip: null,
  },
  CredentialsSignin: {
    title: "로그인 정보 오류",
    message: "이메일 또는 비밀번호가 올바르지 않습니다.",
    detail: "다시 확인해주세요.",
    tip: null,
  },
  SessionRequired: {
    title: "세션 오류",
    message: "로그인이 필요합니다.",
    detail: "로그인 후 다시 시도해주세요.",
    tip: null,
  },
};

const DEFAULT_ERROR: ErrorInfo = {
  title: "인증 오류",
  message: "로그인 처리 중 문제가 발생했습니다.",
  detail: "잠시 후 다시 시도해주세요.",
  tip: null,
};

function AuthErrorContent() {
  const { getParam } = useSafeNavigation();
  const error = getParam("error");

  useEffect(() => {
    clearAuthLoading();
  }, []);

  const errorInfo = (error && ERROR_MAP[error]) || DEFAULT_ERROR;

  return (
    <div style={authContainerStyle}>
      <section style={authCardStyle}>
        <div style={iconWrapStyle}>
          <span style={iconStyle}>⚠️</span>
        </div>
        <p style={authEyebrowStyle}>오류 발생</p>
        <h1 style={authTitleStyle}>{errorInfo.title}</h1>
        <p style={descriptionStyle}>{errorInfo.message}</p>
        <p style={{ ...detailStyle, marginBottom: errorInfo.tip ? "0.75rem" : "1.85rem" }}>{errorInfo.detail}</p>
        {errorInfo.tip && <p style={tipStyle}>{errorInfo.tip}</p>}
        <div style={buttonGroupStyle}>
          <button
            style={authKakaoButtonStyle}
            onClick={() => (window.location.href = "/auth/signin")}
          >
            <span style={{ fontSize: "1.25rem", marginRight: 8 }}>💬</span>
            다시 로그인
          </button>
          <button
            style={switchAccountButtonStyle}
            onClick={() => startKakaoLogin({ prompt: "login" })}
          >
            다른 계정으로 로그인
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
      <div style={authContainerStyle}>
        <section style={authCardStyle}>
          <p style={{ color: "#6b7280" }}>로딩 중...</p>
        </section>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}

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

const switchAccountButtonStyle: CSSProperties = {
  ...authBaseButtonStyle,
  background:
    "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(99,102,241,0.4))",
  color: "#f8fafc",
  boxShadow: "0 18px 35px rgba(59,130,246,0.35)",
};

const secondaryButtonStyle: CSSProperties = {
  ...authBaseButtonStyle,
  background: "rgba(148,163,184,0.15)",
  color: "#94a3b8",
  boxShadow: "none",
};
