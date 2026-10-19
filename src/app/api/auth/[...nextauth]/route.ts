import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractClientIp, runWithRequestContext } from "@/lib/requestContext";
import { logKakaoCallbackDuration } from "@/lib/loginTiming";

const handler = NextAuth(authOptions);

type RouteContext = { params: Promise<{ nextauth: string[] }> };

const KAKAO_CALLBACK_PATH = "/api/auth/callback/kakao";

/**
 * 요청 컨텍스트(사용자 IP)를 담아 NextAuth 를 실행한다
 * - jwt 콜백 안의 백엔드 로그인 호출이 이 값을 꺼내 X-Forwarded-For 로 넘긴다 (src/services/authService.ts)
 * - 카카오 콜백은 전체 소요를 1줄 남긴다 — 여기서 백엔드 왕복(login.backend)을 빼면 카카오 token·userinfo 2홉이 남는다
 */
async function handle(req: Request, ctx: RouteContext) {
  const run = () => runWithRequestContext({ clientIp: extractClientIp(req.headers) }, () => handler(req, ctx));
  if (new URL(req.url).pathname !== KAKAO_CALLBACK_PATH) return run();

  const startedAt = Date.now();
  let response: Response | undefined;
  try {
    response = await run();
    return response;
  } finally {
    // 예외로 끝나도(응답 없음) 실패로 남기고, 예외는 그대로 위로 던진다
    logKakaoCallbackDuration(Date.now() - startedAt, response);
  }
}

export { handle as GET, handle as POST };
