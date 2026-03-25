import type { CSSProperties } from "react";
import { signIn } from "next-auth/react";
import { AUTH_LOADING_KEY } from "@/app/components/AuthLoadingOverlay";

/**
 * 카카오 로그인 시작 (로딩 오버레이 활성화 포함)
 * @param options.prompt - "login"이면 카카오 로그인 화면 강제 표시 (계정 전환용)
 */
export function startKakaoLogin(options?: { prompt?: "login" }) {
  sessionStorage.setItem(AUTH_LOADING_KEY, "true");
  const authParams = options?.prompt ? { prompt: options.prompt } : undefined;
  signIn("kakao", { callbackUrl: "/mypage" }, authParams);
}

// ─── 공유 스타일 ──────────────────────────────────────────

export const authContainerStyle: CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "2rem",
  background:
    "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.28), transparent 55%), radial-gradient(circle at 80% 80%, rgba(14,165,233,0.2), transparent 60%), var(--background)",
};

export const authCardStyle: CSSProperties = {
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

export const authBaseButtonStyle: CSSProperties = {
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

export const authKakaoButtonStyle: CSSProperties = {
  ...authBaseButtonStyle,
  backgroundColor: "#FEE500",
  color: "#181600",
  boxShadow: "0 18px 35px rgba(251,191,36,0.35)",
};

export const authEyebrowStyle: CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.35em",
  fontSize: "0.72rem",
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: "0.5rem",
};

export const authTitleStyle: CSSProperties = {
  fontSize: "2.15rem",
  fontWeight: 700,
  color: "#e2e8f0",
  marginBottom: "0.75rem",
};
