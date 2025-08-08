import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      userId?: number | null;
      kakaoNickname?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: number;
    kakaoNickname?: string;
  }
}
