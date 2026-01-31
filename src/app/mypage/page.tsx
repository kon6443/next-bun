"use client";

import type { CSSProperties } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { AUTH_LOADING_KEY } from "@/app/components/AuthLoadingOverlay";
// import { getMypage } from "@/services/authService";

export default function Mypage() {
  const { data: session, status } = useSession();
  const user = session?.user;

  const handleKakaoLogin = () => {
    // 전역 로딩 오버레이 활성화
    sessionStorage.setItem(AUTH_LOADING_KEY, "true");
    signIn("kakao");
  };

  if (status === "loading") {
    return (
      <div style={containerStyle}>
        <section style={cardStyle}>
          <p style={{ color: "#6b7280" }}>사용자 정보를 불러오는 중입니다...</p>
        </section>
      </div>
    );
  }

  if (status === "authenticated") {
    return (
      <div style={containerStyle}>
        <section style={cardStyle}>
          <div style={avatarWrapStyle}>
            <span style={avatarStyle}>{user.name?.[0] ?? "🙂"}</span>
          </div>
          <p style={eyebrowStyle}>환영합니다</p>
          <h1 style={titleStyle}>{user.name ?? "마이페이지"}</h1>
          <p style={descriptionStyle}>
            등록된 사용자 번호는 <strong>#{user.userId}</strong> 입니다.
          </p>
          <button style={secondaryButtonStyle} onClick={() => signOut()}>
            로그아웃
          </button>
        </section>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <section style={cardStyle}>
        <p style={eyebrowStyle}>회원 전용 공간</p>
        <h1 style={titleStyle}>로그인이 필요해요</h1>
        <p style={descriptionStyle}>
          마이페이지에서는 개인화된 일정과 즐겨찾기를 확인할 수 있습니다.
        </p>
        <button style={kakaoButtonStyle} onClick={handleKakaoLogin}>
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
  color: "#0f172a",
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

// const AboutPage = () => {
//   return (
//     <div>
//       <h1>My page</h1>
//       <p>This is the mypage page.</p>
//     </div>
//   );
// };

// export default AboutPage;
