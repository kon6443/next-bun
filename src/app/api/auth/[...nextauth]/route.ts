import NextAuth from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { postKakaoSignInUp } from "@/services/authService";

const handler = NextAuth({
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID || "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET || "",
    }),
    // GoogleProvider({
    //   clientId: "",
    //   clientSecret: "",
    // }),
  ],
  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account) {
        try {
          const { userId } = await postKakaoSignInUp({
            accessToken: account.access_token ?? "",
            refreshToken: account.refresh_token ?? "",
            kakaoNickname: user.name ?? "",
          });

          token.userId = userId;
          token.accessToken = account.access_token;
          token.refreshToken = account.refresh_token;
        } catch (err: any) {
          console.error("Error during login/signup:", err);
          // throw new Error(err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      // console.log("session session:", session);
      // session.user.userId = token.userId;
      // session.user.kakaoNickname = token.kakaoNickname;
      // session.user.kakaoId = token.kakaoId;
      session.user.userId = token.userId;
      // console.log("session:", session);
      return session;
    },
  },
});

export { handler as GET, handler as POST };
