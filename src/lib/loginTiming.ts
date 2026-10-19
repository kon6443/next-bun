/**
 * 카카오 로그인 콜백 소요 로그
 *
 * 형식은 jwt 콜백의 백엔드 왕복 계측(src/lib/auth.ts, tag login.backend)과 같다 — Promtail 이
 * level·time 을 레이블·타임스탬프로 쓰므로 두 필드는 빼지 않는다.
 * 쿼리(code·state)·쿠키·IP 는 남기지 않는다.
 */

/**
 * next-auth 콜백은 성공·실패 모두 302 다 — 실패는 Location 이 에러 페이지이거나 로그인 페이지 + error 쿼리인 경우다.
 * 성공 시 Location 은 callbackUrl(사용자가 있던 주소)이라 그 쿼리에 error= 가 있어도 실패로 보지 않는다.
 */
export function isFailedCallback(response: Response | undefined): boolean {
  if (!response) return true;
  if (response.status >= 400) return true;
  const location = response.headers.get('location');
  if (!location) return false;
  // route 의 finally 에서 불리므로 던지면 안 된다 — 해석할 수 없는 Location 은 실패로 남긴다
  let url: URL;
  try {
    url = new URL(location, 'http://localhost');
  } catch {
    return true;
  }
  if (url.pathname.endsWith('/auth/error')) return true;
  return url.pathname.endsWith('/auth/signin') && url.searchParams.has('error');
}

export function logKakaoCallbackDuration(ms: number, response: Response | undefined): void {
  const failed = isFailedCallback(response);
  console.log(
    JSON.stringify({
      level: failed ? 'error' : 'info',
      time: new Date().toISOString(),
      tag: failed ? 'login.callback.error' : 'login.callback',
      ms,
      msg: failed ? '카카오 로그인 콜백 실패' : '카카오 로그인 콜백 소요',
    }),
  );
}
