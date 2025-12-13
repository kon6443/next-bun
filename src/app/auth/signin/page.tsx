"use client";

import type { CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const getErrorMessage = () => {
    switch (error) {
      case "OAuthCallback":
        return "카카오 로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
      case "OAuthSignin":
        return "로그인 요청을 시작하는데 실패했습니다.";
      case "OAuthCreateAccount":
        return "계정을 생성하는데 실패했습니다.";
      case "EmailCreateAccount":
        return "이메일 계정을 생성하는데 실패했습니다.";
      case "Callback":
        return "인증 콜백 처리 중 문제가 발생했습니다.";
      case "OAuthAccountNotLinked":
        return "이미 다른 방법으로 가입된 이메일입니다.";
      case "EmailSignin":
        return "이메일을 전송하는데 실패했습니다.";
      case "CredentialsSignin":
        return "이메일 또는 비밀번호가 올바르지 않습니다.";
      case "SessionRequired":
        return "로그인이 필요합니다.";
      default:
        return null;
    }
  };

  const errorMessage = getErrorMessage();

  return (
    <div style={containerStyle}>
      <section style={cardStyle}>
        <div style={avatarWrapStyle}>
          <span style={avatarStyle}>🔐</span>
        </div>
        <p style={eyebrowStyle}>로그인</p>
        <h1 style={titleStyle}>로그인이 필요해요</h1>
        <p style={descriptionStyle}>
          카카오 계정으로 간편하게 로그인하세요.
        </p>
        {errorMessage && (
          <div style={errorBoxStyle}>
            <p style={errorTextStyle}>{errorMessage}</p>
          </div>
        )}
        <button
          style={kakaoButtonStyle}
          onClick={() => signIn("kakao", { callbackUrl: "/mypage" })}
        >
          <span style={{ fontSize: "1.25rem", marginRight: 8 }}>💬</span>
          카카오로 계속하기
        </button>
      </section>
    </div>
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
  marginBottom: "1.85rem",
};

const errorBoxStyle: CSSProperties = {
  background: "rgba(239,68,68,0.1)",
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

const kakaoButtonStyle: CSSProperties = {
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
  backgroundColor: "#FEE500",
  color: "#181600",
  boxShadow: "0 18px 35px rgba(251,191,36,0.35)",
};
