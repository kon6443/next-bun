"use client";

import type { CSSProperties } from "react";
import { Suspense } from "react";
import { useSafeNavigation } from "@/app/hooks";
import {
  startKakaoLogin,
  authContainerStyle,
  authCardStyle,
  authKakaoButtonStyle,
  authEyebrowStyle,
  authTitleStyle,
} from "../shared";

const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallback: "카카오 로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
  OAuthSignin: "로그인 요청을 시작하는데 실패했습니다.",
  OAuthCreateAccount: "계정을 생성하는데 실패했습니다.",
  EmailCreateAccount: "이메일 계정을 생성하는데 실패했습니다.",
  Callback: "인증 콜백 처리 중 문제가 발생했습니다.",
  OAuthAccountNotLinked: "이미 다른 방법으로 가입된 이메일입니다.",
  EmailSignin: "이메일을 전송하는데 실패했습니다.",
  CredentialsSignin: "이메일 또는 비밀번호가 올바르지 않습니다.",
  SessionRequired: "로그인이 필요합니다.",
};

function SignInContent() {
  const { getParam } = useSafeNavigation();
  const error = getParam("error") || null;
  const errorMessage = error ? ERROR_MESSAGES[error] ?? null : null;

  return (
    <div style={authContainerStyle}>
      <section style={authCardStyle}>
        <div style={avatarWrapStyle}>
          <span style={avatarStyle}>🔐</span>
        </div>
        <p style={authEyebrowStyle}>로그인</p>
        <h1 style={authTitleStyle}>로그인이 필요해요</h1>
        <p style={descriptionStyle}>
          카카오 계정으로 간편하게 로그인하세요.
        </p>
        {errorMessage && (
          <div style={errorBoxStyle}>
            <p style={errorTextStyle}>{errorMessage}</p>
          </div>
        )}
        <button
          style={authKakaoButtonStyle}
          onClick={() => startKakaoLogin()}
        >
          <span style={{ fontSize: "1.25rem", marginRight: 8 }}>💬</span>
          카카오로 계속하기
        </button>
      </section>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div style={authContainerStyle}>
        <section style={authCardStyle}>
          <p style={{ color: "#6b7280" }}>로딩 중...</p>
        </section>
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}

const avatarWrapStyle: CSSProperties = {
  width: 80,
  height: 80,
  margin: "0 auto 1rem",
  borderRadius: "9999px",
  background:
    "linear-gradient(135deg, rgba(37,99,235,0.2), rgba(99,102,241,0.2))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const avatarStyle: CSSProperties = {
  fontSize: "2.25rem",
  fontWeight: 600,
  color: "#f8fafc",
};

const descriptionStyle: CSSProperties = {
  fontSize: "1rem",
  color: "#cbd5f5",
  lineHeight: 1.6,
  marginBottom: "1.85rem",
};

const errorBoxStyle: CSSProperties = {
  background: "rgba(239,68,68,0.2)",
  border: "1px solid rgba(239,68,68,0.3)",
  borderRadius: "12px",
  padding: "1rem",
  marginBottom: "1.5rem",
};

const errorTextStyle: CSSProperties = {
  fontSize: "0.875rem",
  color: "#fca5a5",
  lineHeight: 1.6,
  margin: 0,
};
