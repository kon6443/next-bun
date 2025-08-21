"use client";

import { useSession, signIn, signOut } from "next-auth/react";
// import { getMypage } from "@/services/authService";

export default function Mypage() {
  const { data: session, status } = useSession();
  const user = session?.user;

  // 로딩 중일 때 보여줄 화면
  if (status === "loading") {
    return <div>로딩 중...</div>;
  }

  // 로그인된 상태일 때 보여줄 화면
  if (status === "authenticated") {
    return (
      <div>
        <h1>마이페이지</h1>
        <p>환영합니다!</p>
        <p>당신의 userId는 {user.userId}입니다.</p>
        <button
          onClick={() => signOut()}
          style={{ marginTop: "20px", padding: "10px" }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  // 로그인되지 않은 상태일 때 보여줄 화면
  return (
    <div>
      <h1>로그인이 필요합니다.</h1>
      <p>마이페이지를 보려면 로그인하세요.</p>
      <button
        onClick={() => signIn("kakao")}
        style={{
          marginTop: "20px",
          padding: "10px",
          backgroundColor: "#FEE500",
          color: "#000000",
          border: "none",
          borderRadius: "12px",
          cursor: "pointer",
        }}
      >
        카카오 로그인
      </button>
    </div>
  );
}

// const AboutPage = () => {
//   return (
//     <div>
//       <h1>My page</h1>
//       <p>This is the mypage page.</p>
//     </div>
//   );
// };

// export default AboutPage;
