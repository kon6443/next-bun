"use client";

import type { CSSProperties } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
// import { getMypage } from "@/services/authService";

export default function Mypage() {
  const { data: session, status } = useSession();
  const user = session?.user;

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
        <button style={kakaoButtonStyle} onClick={() => signIn("kakao")}>
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
    "radial-gradient(circle at top, rgba(99,102,241,0.15), transparent 60%), radial-gradient(circle at bottom, rgba(59,130,246,0.15), transparent 60%), #0f172a",
};

const cardStyle: CSSProperties = {
  width: "min(420px, 100%)",
  backgroundColor: "#ffffff",
  borderRadius: "24px",
  padding: "2.5rem",
  boxShadow:
    "0 25px 50px -12px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.4)",
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
  color: "#1f2937",
};

const eyebrowStyle: CSSProperties = {
  textTransform: "uppercase",
  letterSpacing: "0.2em",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#94a3b8",
  marginBottom: "0.5rem",
};

const titleStyle: CSSProperties = {
  fontSize: "2rem",
  fontWeight: 700,
  color: "#111827",
  marginBottom: "0.75rem",
};

const descriptionStyle: CSSProperties = {
  fontSize: "1rem",
  color: "#475569",
  lineHeight: 1.5,
  marginBottom: "1.75rem",
};

const baseButtonStyle: CSSProperties = {
  width: "100%",
  borderRadius: "9999px",
  border: "none",
  padding: "0.9rem 1.25rem",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.35rem",
};

const kakaoButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  backgroundColor: "#FEE500",
  color: "#181600",
  boxShadow: "0 10px 20px rgba(251,191,36,0.35)",
};

const secondaryButtonStyle: CSSProperties = {
  ...baseButtonStyle,
  background:
    "linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12))",
  color: "#1d4ed8",
  boxShadow: "0 10px 20px rgba(59,130,246,0.2)",
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
