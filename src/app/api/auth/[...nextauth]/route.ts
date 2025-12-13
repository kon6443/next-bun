import NextAuth from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { postKakaoSignInUp } from "@/services/authService";

const handler = NextAuth({
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID || "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET || "",
      httpOptions: {
        timeout: 10000, // 10초로 타임아웃 설정 (기본값 3500ms에서 증가)
      },
    }),
    // GoogleProvider({
    //   clientId: "",
    //   clientSecret: "",
    // }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  // events: {
  //   async signIn({ user, account }) {
  //     // 카카오 로그인 성공 시 로깅 (디버깅용, 필요시 주석 해제)
  //     // if (account?.provider === "kakao") {
  //     //   console.log("Kakao sign in successful", {
  //     //     userId: user.id,
  //     //     email: user.email,
  //     //     name: user.name,
  //     //   });
  //     // }
  //   },
  // },
  // debug: process.env.NODE_ENV === "development",

  callbacks: {
    async signIn({ account }) {
      // 카카오 provider인 경우 account와 access_token 확인
      if (account?.provider === "kakao") {
        if (!account || !account.access_token) {
          console.error("Kakao OAuth account or access_token is missing", {
            hasAccount: !!account,
            hasAccessToken: !!account?.access_token,
            provider: account?.provider,
          });
          return false; // 로그인 실패
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // 카카오 provider인 경우에만 처리
      if (user && account && account.provider === "kakao") {
        // access_token이 없으면 에러 처리
        if (!account.access_token) {
          console.error("Kakao access_token is missing", {
            hasAccount: !!account,
            hasAccessToken: !!account?.access_token,
            provider: account?.provider,
          });
          throw new Error("카카오 로그인 인증 정보를 가져오는데 실패했습니다.");
        }

        try {
          const { userId, loginType } = await postKakaoSignInUp({
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? "",
            kakaoNickname: user.name ?? "",
          });

          token.userId = userId;
          token.loginType = loginType;
          // 디버깅용 로그 (필요시 주석 해제)
          // console.log("token:", token);
        } catch (err) {
          console.error("Error during login/signup:", err);
          const errorMessage = err instanceof Error ? err.message : "로그인 처리 중 오류가 발생했습니다.";
          
          // 카카오 속도 제한 에러인 경우 명확한 메시지
          if (errorMessage.includes("rate limit") || errorMessage.includes("속도") || errorMessage.includes("LOGIN FAILED")) {
            throw new Error("카카오 로그인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
          }
          
          throw new Error(errorMessage || "로그인 처리 중 오류가 발생했습니다.");
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.userId = token.userId;
      session.user.loginType = token.loginType;
      // 디버깅용 로그 (필요시 주석 해제)
      // console.log("session:", session);
      return session;
    },
  },
});

export { handler as GET, handler as POST };
