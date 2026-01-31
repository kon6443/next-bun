import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { postKakaoSignInUp } from "@/services/authService";

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;

const isProd = process.env.NODE_ENV === "production";
const cookieDomain = process.env.NEXTAUTH_COOKIE_DOMAIN;

export const authOptions: NextAuthOptions = {
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
  session: {
    strategy: "jwt",
    // 로그인 유지시간(세션 쿠키 만료) = 백엔드 accessToken(JWT) 만료와 동일하게 맞춤
    maxAge: THIRTY_DAYS_IN_SECONDS,
  },
  jwt: {
    maxAge: THIRTY_DAYS_IN_SECONDS,
  },
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
    async jwt({ token, user, account, trigger, session }) {
      // 세션 업데이트 트리거 처리 (닉네임 수정 등)
      if (trigger === "update" && session?.userName) {
        token.userName = session.userName;
        return token;
      }
      
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
          const response = await postKakaoSignInUp({
            accessToken: account.access_token,
            kakaoNickname: user.name ?? "",
          });

          const { userId, userName, loginType, accessToken, tokenType } = response.data;

          token.userId = userId;
          token.userName = userName;
          token.loginType = loginType;
          token.accessToken = accessToken;
          token.tokenType = tokenType;
          // 디버깅용 로그 (필요시 주석 해제)
          // console.log("token:", token);
        } catch (err) {
          console.error("Error during login/signup:", err);
          const errorMessage = err instanceof Error ? err.message : "로그인 처리 중 오류가 발생했습니다.";

          // 카카오 속도 제한 에러인 경우 명확한 메시지
          if (errorMessage.includes("rate limit") || errorMessage.includes("속도")) {
            throw new Error("카카오 로그인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.");
          }

          // Validation 에러인 경우 원본 메시지 사용
          if (errorMessage.includes("LOGIN FAILED") && errorMessage.includes("400")) {
            // NestJS validation 에러 메시지 추출
            const match = errorMessage.match(/LOGIN FAILED: 400 Bad Request - (.+)/);
            if (match && match[1]) {
              throw new Error(`로그인 처리 중 오류가 발생했습니다: ${match[1]}`);
            }
          }

          throw new Error(errorMessage || "로그인 처리 중 오류가 발생했습니다.");
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.userId = token.userId;
      session.user.userName = token.userName;
      session.user.loginType = token.loginType;
      session.user.accessToken = token.accessToken;
      session.user.tokenType = token.tokenType;
      return session;
    },
  },
  // Caddy 프록시 뒤에서도 동작하도록 NEXTAUTH_URL 환경변수 설정 필요
  // useSecureCookies는 cookies 옵션의 secure로 처리됨
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-next-auth.session-token" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
    callbackUrl: {
      name: isProd ? "__Secure-next-auth.callback-url" : "next-auth.callback-url",
      options: {
        sameSite: "lax",
        path: "/",
        secure: isProd,
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      },
    },
  },
};
