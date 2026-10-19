import { FetchClient } from './FetchService';

/**
 * 서버(Next 서버 프로세스)에서 백엔드를 부를 때의 기준 주소
 *
 * NEXT_PUBLIC_API 는 공인 도메인이라 서버에서 부르면 인터넷으로 나갔다 Caddy 를 거쳐 돌아온다(헤어핀).
 * 런타임 env SERVER_API_BASE(예: http://prod_nest_app:3500, 같은 overlay 내부 주소)가 있으면 직행한다.
 * 없으면(로컬 dev 등) 기존처럼 NEXT_PUBLIC_API 를 쓴다.
 * NEXT_PUBLIC_ 접두사가 아니라 번들에 들어가지 않고 서버 런타임에만 읽힌다.
 */
export function resolveServerApiBase(serverApiBase: string | undefined, publicApi: string | undefined): string {
  return serverApiBase || publicApi || '';
}

// process.env.X 를 리터럴로 써야 한다 — NEXT_PUBLIC_API 는 빌드 때 값으로 인라인된다.
// standalone 컨테이너는 .env.local 을 읽지 않으므로, 별칭(env.X)으로 읽으면 런타임 env 에 없을 때 폴백이 '' 가 된다
const serverFetchInstance = new FetchClient(
  resolveServerApiBase(process.env.SERVER_API_BASE, process.env.NEXT_PUBLIC_API),
);
export default serverFetchInstance;
