import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractClientIp, runWithRequestContext } from "@/lib/requestContext";

const handler = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

/**
 * 요청 컨텍스트(사용자 IP)를 담아 NextAuth 를 실행한다
 * - jwt 콜백 안의 백엔드 로그인 호출이 이 값을 꺼내 X-Forwarded-For 로 넘긴다 (src/services/authService.ts)
 */
function handle(req: Request, ctx: RouteContext) {
  return runWithRequestContext({ clientIp: extractClientIp(req.headers) }, () => handler(req, ctx));
}

export { handle as GET, handle as POST };
