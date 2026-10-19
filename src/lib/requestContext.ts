import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';

/**
 * 서버 요청 컨텍스트 — NextAuth 콜백(jwt 등)은 요청 객체를 받지 못하므로,
 * 라우트 핸들러에서 필요한 값을 담아 두고 콜백 안의 서버 코드가 꺼내 쓴다.
 * (AsyncLocalStorage 는 await·fetch·node:http 콜백을 지나도 유지된다 — Bun·Node 모두 실측)
 */
export type RequestContext = {
  /** 브라우저 사용자 IP (Caddy 가 붙인 X-Forwarded-For 마지막 값, 형식 검증 통과 시에만) */
  clientIp?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * 들어온 요청의 X-Forwarded-For 에서 사용자 IP 를 꺼낸다
 *
 * **마지막** 값(바로 앞 프록시 Caddy 가 직접 본 상대 주소)만 쓴다. 첫 값은 클라이언트가 보낸 헤더가
 * 앞에 남은 것일 수 있어 위조로 로그인 스로틀 키를 바꿀 수 있다 — 백엔드 trust proxy 1(마지막 값 신뢰)과 같은 기준.
 * IPv4·IPv6 형식이 아니면 버린다 — 잘못된 값을 백엔드 스로틀 키로 넘기지 않게
 */
export function extractClientIp(headers: Pick<Headers, 'get'>): string | undefined {
  const forwardedFor = headers.get('x-forwarded-for');
  if (!forwardedFor) return undefined;
  const last = forwardedFor.split(',').at(-1)?.trim();
  if (!last) return undefined;
  return isIP(last) ? last : undefined;
}
