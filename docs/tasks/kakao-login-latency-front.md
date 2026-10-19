# 카카오 로그인 지연 — 프론트 작업 기록

- 진행 상황과 결정의 SSOT: [`../bun/docs/tasks/tasks-kakao-login-latency.md`](../../../bun/docs/tasks/tasks-kakao-login-latency.md) §10 (백엔드 메인 세션이 관리)
- 이 문서에는 프론트(next-bun)의 실측 근거, 변경 내역, 회귀 재현 절차만 둔다
- 브랜치: `feat-onam-login` (develop 기반)

## 1. 실측 근거 (2026-10-16, 로컬, Bun 1.4.0 / Node 22.21.1, 외부 서비스 호출 없음)

| # | 실험 | Bun | Node |
|---|---|---|---|
| T1 | `http.request(..., { timeout: 2000 })` 응답 없는 IP(10.255.255.1) 연결 | 12초 동안 이벤트 없음 | 2003ms에 timeout |
| T2 | 같은 timeout, 연결은 되고 응답 5초 지연 | 2317ms에 timeout | 2797ms에 timeout |
| R1 | 유휴 3초 뒤 FIN·RST 없이 버리는 중계기 경유, req1 → 5초 유휴 → req2 (fetch 기본) | req2 abort까지 멈춤(15,006ms) | req2 6ms 정상 (새 연결) |
| R2 | R1 + `Connection: close` | req2 1ms | req2 5ms |
| R3 | 서버가 긴 keep-alive 허용 시 유휴 후 소켓 재사용 | 65초 유휴 후에도 재사용 | 30초 유휴 후 재사용 |
| R4 | AsyncLocalStorage가 setTimeout·fetch·node:http 콜백을 지나도 유지되는가 | 유지 | 유지 |

해석
- T1: next-auth의 카카오 token·userinfo 호출(openid-client `request.js`의 `timeout`)은 Bun에서 **연결 단계**에 상한이 없다. 업스트림 회귀로 알려져 있다(oven-sh/bun#41133).
- R1: Bun fetch는 중간에서 조용히 끊긴 풀 소켓을 재사용하고, signal이 없으면 끝없이 기다린다.
- R1이 Node에서 재현되지 않은 이유
  - 시험 백엔드(Bun.serve)가 `Keep-Alive: timeout=` 힌트를 보내지 않았다.
  - 힌트가 없으면 undici는 기본 약 4초 뒤 유휴 소켓을 닫는다.
  - Node http 서버(Express·Nest)는 기본으로 `Keep-Alive: timeout=5`를 보낸다.
- R2: `Connection: close`는 두 런타임 모두에서 같은 의미로 동작한다. `keepalive:false`는 Node fetch에서 다른 의미의 플래그라 쓰지 않는다.

## 2. 변경 내역

### D2 로그인 버튼 중복 클릭 방지
- `src/app/auth/kakaoLoginStarter.ts`(+test): 탭 단위 잠금. 진행 중에 다시 시작하면 무시하고, 실패하면 잠금을 푼다
- `src/app/auth/shared.ts` `startKakaoLogin()`이 잠금을 거친다. 옵션은 `prompt`·`callbackUrl`이고 `resetKakaoLogin()`을 둔다
- `src/app/auth/useKakaoLogin.ts`(+test): 버튼용 훅
  - 누르는 즉시 busy 상태가 된다
  - 실패하면 다시 활성화하고 토스트를 띄운다
  - bfcache 복원(`pageshow` persisted)이면 해제한다
- 적용: 로그인 페이지, 에러 페이지, mypage 2곳, `teams/LoginButton`, 초대 수락 자동 로그인

### D3 배포 직후 모듈 예열 — **보류**
- 레플리카당 첫 인증 요청에 붙는 콜드 비용은 약 70~190ms다(standalone `bun server.js` 5회 측정). 수 초 단위 증상과 크기가 맞지 않는다 (SSOT §10-5)

### D4 로그인 백엔드 호출 경로
- ① `src/services/authService.ts`: 백엔드 로그인 요청에 `Connection: close`를 붙인다 (R1·R2)
- ② `src/services/serverFetch.ts`(+test): 서버 전용 base `SERVER_API_BASE`를 쓰고, 없으면 `NEXT_PUBLIC_API`로 폴백한다. 사용처는 authService 한 곳이다
  - 스택 `infra/docker-stack.app.yml`: `SERVER_API_BASE: "http://prod_nest_app:3500"` (두 스택 모두 overlay `sys_default`)
- ③ `src/lib/requestContext.ts`(+test): AsyncLocalStorage에 사용자 IP를 담는다
  - `api/auth/[...nextauth]/route.ts`가 핸들러를 감싼다
  - IP는 들어온 `X-Forwarded-For` **마지막** 값(Caddy가 직접 본 주소)이다. 첫 값은 클라이언트 위조가 남을 수 있어 쓰지 않는다(백엔드 trust proxy 1과 같은 기준). `isIP` 검증을 통과한 것만 쓰고, 실패하거나 없으면 헤더를 붙이지 않는다
  - authService가 `X-Forwarded-For: <clientIp>`로 넘긴다
  - 백엔드 `getTracker`는 `req.ip`(trust proxy 1)를 쓰도록 바뀌었다(백엔드 `feat-onam-login`)
- **②와 ③은 같이 배포한다.** 헤어핀으로 폴백하면 Caddy가 XFF를 덮어써 사용자 IP가 전달되지 않는다
- `src/services/serverFetch.ts`는 `process.env.SERVER_API_BASE`·`process.env.NEXT_PUBLIC_API`를 **리터럴로** 읽는다. 별칭(`env.X`)으로 읽으면 `NEXT_PUBLIC_API`가 빌드 때 인라인되지 않는다. standalone 컨테이너는 `.env.local`을 읽지 않으므로, 그러면 `SERVER_API_BASE`를 뺀 롤백에서 base가 `''`가 돼 로그인이 전부 실패한다(리뷰 B 지적)
- `src/lib/auth.ts`의 백엔드 왕복 계측(`login.backend`)도 이번 묶음에 넣는다(별도 커밋)

## 3. 회귀 재현 절차 (R1 — 유휴 연결 끊김)

로컬 포트 바인딩이 필요하다(sandbox 밖에서 실행하거나 `sandbox.network.allowLocalBinding: true`). 외부 호출은 없다.

```bash
mkdir -p /tmp/idle && cd /tmp/idle
cat > backend.js <<'JS'
Bun.serve({ port: 4101, hostname: '127.0.0.1', idleTimeout: 120, fetch: () => new Response('ok') });
JS
cat > proxy.js <<'JS'
// 유휴 IDLE_MS 뒤로는 FIN·RST 없이 바이트를 버린다 (IPVS 유휴 항목 만료 흉내)
const net = require('net'); const IDLE_MS = Number(process.env.IDLE_MS || 3000);
net.createServer(c => { const u = net.connect(4101, '127.0.0.1'); let last = Date.now(), dead = false;
  const tick = () => { if (!dead && Date.now() - last > IDLE_MS) dead = true; }; const t = setInterval(tick, 200);
  c.on('data', d => { tick(); if (dead) return; last = Date.now(); u.write(d); });
  u.on('data', d => { tick(); if (dead) return; last = Date.now(); c.write(d); });
  const end = () => { clearInterval(t); c.destroy(); u.destroy(); };
  c.on('error', end); u.on('error', end); c.on('close', end); u.on('close', end);
}).listen(4100, '127.0.0.1');
JS
cat > client.js <<'JS'
const url = 'http://127.0.0.1:4100/';
const t = async (label, opts = {}) => { const t0 = Date.now();
  try { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) }); await r.text(); console.log(label, 'ok', Date.now() - t0, 'ms'); }
  catch (e) { console.log(label, 'fail', Date.now() - t0, 'ms', e.name); } };
for (const [name, opts] of [['기본', {}], ['Connection: close', { headers: { Connection: 'close' } }]]) {
  await t(`[${name}] req1`, opts); await new Promise(r => setTimeout(r, 5000)); await t(`[${name}] req2(유휴 후)`, opts);
}
process.exit(0);
JS
bun backend.js & node proxy.js & sleep 1
bun client.js     # 기대: [기본] req2 fail ~8000ms / [Connection: close] req2 ok 수 ms
node client.js    # 기대: 둘 다 ok (undici 기본 유휴 정리)
kill %1 %2
```

## 4. 남은 확인 사항 (서버 접근 필요)
- **Next 23000 포트의 외부 노출 여부**
  - `infra/docker-stack.app.yml`이 ingress로 publish한다
  - 외부에 노출돼 있으면 Caddy를 거치지 않고 Next에 직접 보낸 위조 `X-Forwarded-For`가 백엔드 스로틀 키로 전달된다. 영향은 로그인 스로틀 우회 수준이다
  - 2026-10-16 백엔드 메인 세션 확인: 운영 23000·23500 포트는 외부에서 closed/filtered — 직접 접근 경로는 닫혀 있다
- Caddyfile의 XFF·trusted_proxies·keepalive 설정, OCI NAT 유휴 정책
- 운영 이미지 bun 버전에서 T1·R1 재현 (`docker exec` 승인 필요)
- Bun 풀이 900초 넘게 소켓을 유지하는지 (R3 연장 — 16분짜리 실험)

## 5. C1 — 카카오 로그인 콜백 전체 소요 로그 (2026-10-16)
- `src/app/api/auth/[...nextauth]/route.ts` 래퍼: `/api/auth/callback/kakao` 요청만 시작·종료를 재서 `src/lib/loginTiming.ts`로 1줄을 남긴다
  - 형식: `{level, time, tag: login.callback | login.callback.error, ms, msg}` — `src/lib/auth.ts`의 `login.backend`와 같다
  - 실패 판정: next-auth 콜백은 성공·실패 모두 302다. 그래서 Location 경로가 `/auth/error`이거나, `/auth/signin`이면서 `error` 쿼리가 있으면 실패로 본다. 성공 시 Location은 callbackUrl(사용자가 있던 주소)이라 그 쿼리의 `error=`는 실패로 보지 않는다. 카카오 화면에서 사용자가 취소한 경우(`access_denied`)도 실패로 남는다(분리는 후속). 응답 없이 예외가 나도 실패다. `finally`에서 남기고 예외는 다시 던진다
  - 쿼리(code·state)·쿠키·IP는 남기지 않는다. 상관 ID는 넣지 않았다(결정)
- 분해 방법: 카카오 token·userinfo 2홉 ≈ `login.callback.ms − login.backend.ms`. 같은 레플리카에서 같은 시각에 찍힌 쌍끼리 뺀다
- 테스트(`route.test.ts` 6건)
  - 해석할 수 없는 Location이어도 응답을 그대로 돌려주고 실패로 남긴다(로그 판정이 응답을 깨지 않는다)
  - 콜백 경로에서만 1줄을 남긴다
  - 인가 코드가 로그에 섞이지 않는다
  - Location 기준으로 실패를 판정한다(에러 페이지, 로그인 페이지 + error 쿼리)
  - callbackUrl의 `error` 쿼리는 성공으로 남긴다
  - 예외가 나도 로그를 남기고 다시 던진다
  - 핸들러 안에서 요청 컨텍스트를 꺼낼 수 있다

## 6. R1 — 운영 런타임 Bun → Node 24 (2026-10-16)
- `Dockerfile`
  - 빌드·운영 모두 `node:24-bookworm-slim`이다(백엔드와 같다)
  - 의존성 설치용으로만 `oven/bun:1`에서 bun 바이너리를 복사해 넣는다
  - `next build`는 `node node_modules/next/dist/bin/next build`로 실행해 빌드 런타임을 Node로 고정한다
  - 운영 이미지에는 bun이 없다. `USER node`, `CMD ["node", "server.js"]`
- 왜 "bun 이미지에서 빌드하고 node 이미지에서 실행"이 아닌가: bun 이미지에는 node가 없다. 그러면 `bun run build`가 next CLI를 Bun으로 실행해 빌드 런타임과 운영 런타임이 달라진다
- `infra/docker-stack.app.yml` healthcheck: `node -e "fetch(...).then(...).catch(...)"`. CommonJS라 최상위 await를 쓸 수 없다. **Dockerfile과 같은 커밋**으로 묶는다
- 워크플로: 런타임을 전제로 한 단계가 없다. 주석 2줄만 고쳤다. verify는 원래 setup-node 24로 lint·typecheck·test를 돌린다
- **롤백은 stack 파일 단위로 한다.** 이미지만 옛 bun 태그로 바꾸면(`docker service update --image`) healthcheck의 `node -e`가 bun 이미지에 없어 실패한다. Swarm 자동 롤백(`failure_action: rollback`)은 spec 전체를 되돌리므로 안전하다

### 검증 (로컬 — Docker 데몬이 꺼져 있어 이미지 빌드 대신 standalone 직접 실행)
- Node 24.22.0(npx 일회 실행)으로 standalone 서버 실행과 healthcheck 명령을 확인했다. 빌드는 로컬 Node 22.21.1로 `next build`를 직접 실행했다

| 항목 | Node 24 | Bun 1.4.0 |
|---|---|---|
| 기동(health 200까지) | 448ms | 530ms |
| healthcheck 명령(스택과 같은 식) | exit 0 | exit 0 |
| health·providers·csrf·session·signin POST | 전부 200 | 전부 200 |
| RSS 기동 직후 → 요청 55회 후 | 118MB → 144MB | 92MB → 119MB |
| 서버 로그 에러 | 0 | 0 |

- 서버가 없을 때 healthcheck: exit 1 (174ms). 멈추지 않는다
- #41133 재현(T1): Node 24 2004ms timeout (Bun은 12초 동안 이벤트 없음)
- R1 재현(유휴 소켓 블랙홀): Node 24는 백엔드가 Bun.serve(힌트 없음)든 Node http(`Keep-Alive: timeout=5`)든 기본·`keepalive:false`·`Connection: close` 모두에서 req2가 정상이었다(2~7ms)
- 미측정: 운영 이미지 크기(Docker 데몬 꺼짐), 운영 ARM 노드에서의 RSS·기동 시간
