import type { CSSProperties } from "react";
import { signIn } from "next-auth/react";
import { AUTH_LOADING_KEY, clearAuthLoading } from "@/app/components/AuthLoadingOverlay";
import { createLoginStarter } from "./kakaoLoginStarter";

export type KakaoLoginOptions = {
  /** "login"이면 카카오 로그인 화면 강제 표시 (계정 전환용) */
  prompt?: "login";
  /** 로그인 후 이동할 주소 (기본 /mypage) */
  callbackUrl?: string;
};

// 페이지(탭) 단위 잠금 — 같은 화면의 로그인 버튼이 여러 개여도 시작은 한 번만 보낸다
const kakaoLoginStarter = createLoginStarter();

/**
 * 카카오 로그인 시작 (로딩 오버레이 활성화 포함, 중복 시작 방지)
 * @returns 실제로 시작했으면 true, 이미 진행 중이라 무시했으면 false
 * @throws 시작 요청이 실패하면(네트워크 등) 잠금·오버레이를 정리한 뒤 던진다
 */
export function startKakaoLogin(options?: KakaoLoginOptions): Promise<boolean> {
  const authParams = options?.prompt ? { prompt: options.prompt } : undefined;
  return kakaoLoginStarter.start({
    signIn: () => signIn("kakao", { callbackUrl: options?.callbackUrl ?? "/mypage" }, authParams),
    onStart: () => sessionStorage.setItem(AUTH_LOADING_KEY, "true"),
    onReset: clearAuthLoading,
  });
}

/** 화면에 다시 남게 됐을 때(뒤로가기로 bfcache 복원 등) 잠금·오버레이를 푼다 */
export function resetKakaoLogin() {
  kakaoLoginStarter.reset(clearAuthLoading);
}

// 잠금은 모듈 단위라 해제도 모듈에서 한 번 건다 — 버튼 훅이 없는 진입점(초대 수락 자동 로그인)에서
// 카카오로 갔다가 뒤로가기로 복원돼도 잠금이 남아 다른 화면의 로그인 버튼이 멈추지 않게 한다
if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) resetKakaoLogin();
  });
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

/** 로그인 시작 후 비활성 표시 — 중복 클릭을 막는 동안 눌리지 않는 것처럼 보이게 */
export const authButtonBusyStyle: CSSProperties = {
  cursor: "progress",
  opacity: 0.7,
  filter: "saturate(0.8)",
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
