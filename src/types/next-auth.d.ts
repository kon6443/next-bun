import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      userId?: number | null;
      kakaoNickname?: string | null;
      loginType?: string | null;
      accessToken?: string | null;
      tokenType?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: number;
    kakaoNickname?: string;
    loginType?: string;
    accessToken?: string;
    tokenType?: string;
  }
}
