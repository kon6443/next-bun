# 작업 기록 — 프론트 전수조사 후속 수정

## 2026-10-15

### 감사
- `origin/develop`(b60ee60) 기준으로 감사했다. 결과는 [감사 보고서](../front-audit-2026-10.md)에 있다.
- 기준선은 다음과 같다.
  - lint: 에러 0, 경고 4
  - typecheck: 통과
  - test:run: 17건 실패. 모두 `.claude/worktrees` 안의 테스트를 수집한 데서 생겼다. 이 경로를 빼면 100건 모두 통과한다.
- 작업트리의 `node_modules`가 비어 있어서 `bun install --frozen-lockfile`로 설치했다. lockfile은 바뀌지 않았다.

### 추가 조사 (a) 삭제 댓글의 `commentContent`
- 프론트에서 `commentContent`를 쓰는 곳은 전부 `TaskDetailPage.tsx`에 있다(grep 전수).
  - `:168` 소켓 생성 이벤트
  - `:196` 소켓 수정 이벤트
  - `:391` 편집 시작
  - `:777` 렌더
- 삭제 댓글(status 0)의 내용은 어디에서도 쓰지 않는다.
  - 렌더 `:773`은 `status === 0`이면 "삭제된 댓글입니다."만 출력한다.
  - 편집·삭제 버튼은 `currentUserId === comment.userId && comment.status !== 0`일 때만 나온다(`:751`). 그래서 `:391`로 삭제 댓글의 내용을 읽을 수 없다.
  - 소켓 `CommentDeletedPayload`(`types/socket.ts:121-126`)에는 내용 필드가 없다. 핸들러(`:209-224`)는 `status: 0`만 바꾼다.
  - 그 밖에 `.comments`를 쓰는 곳은 `TaskDetailPage.tsx` 안뿐이다. 캐시·수정 이력·목록 미리보기·댓글 수 표시는 없다.
- 타입은 `commentContent: string`(non-null)이다. 위치는 `app/types/task.ts:22`, `services/teamService.ts:137`(`TaskCommentResponse`), `types/socket.ts:106,115`이다.
- 결론: 백엔드가 삭제 댓글의 내용을 **빈 문자열 `""`**로 내려도 프론트는 바꿀 것이 없다(권장). `null`로 내리면 동작에는 영향이 없지만 타입 계약이 어긋난다. 이 경우 `TaskComment`·`TaskCommentResponse`를 `string | null`로 바꾸는 프론트 수정 1커밋이 필요하다.
- 참고: 이미 로드된 화면에서 다른 사람이 댓글을 지우면, 원문이 메모리에 남은 채로 `status`만 0이 된다. 화면에는 나오지 않으므로 새로 노출되는 것은 없다.

### 추가 조사 (b) `kakaoEmail`·`birth`
- `src` 전체를 `kakaoEmail|birth|email`로 grep한 결과 0건이다. 프론트 타입 `TeamUserResponse`(`teamService.ts:211-217`)에는 `userId, userName, role, joinedAt, userActStatus`만 있다.
- 결론: 프론트는 이 필드를 표시하지도 쓰지도 않는다. 백엔드가 응답에서 이 필드를 빼더라도 프론트에는 영향이 없다. 사용자 결정상 보는 것은 허용이므로 프론트 쪽 조치는 없다.

### 추가 조사 (c) 연동 상태 API를 MEMBER에게 최소 정보만 주도록 바꿀 때의 영향
- 조회 위치:
  - `TeamBoard.tsx:485-492`: 초기 `Promise.all`에서 역할과 무관하게 telegram·discord status를 모두 조회한다.
  - `useTelegramLink.ts:100`, `useDiscordLink.ts:95`: 새로고침 버튼으로 조회한다.
  - `useTeamData.ts:101,149`: 이 파일은 import 0건인 데드코드다(G14).
- 표시 위치: telegram·discord 탭은 `visible: canManageInvites`이다(`TeamManagementSection.tsx:221,228`). 비관리자에게는 렌더 자체가 되지 않는다.
- 타입:
  - `TelegramStatusResponse`는 `isLinked: boolean`, `chatId: number | null`, `pendingLink?`이다.
  - `DiscordStatusResponse`는 `isLinked`, `webhookUrl: string | null`이다.
- 백엔드가 MEMBER 응답에서 `chatId`·`webhookUrl`·`pendingLink`를 빼는 경우:
  - 런타임에서는 깨지지 않는다. `TelegramSection:49`의 `isLinked` 분기에서 `chatId`가 undefined면 빈칸으로 렌더된다. `DiscordSection:60`의 `isLinked && webhookUrl` 분기는 미연동 폼으로 떨어진다.
  - 그런데 두 컴포넌트 모두 비관리자에게는 보이지 않으므로 실제 영향은 없다. 타입만 실제 응답과 어긋난다.
- 판단: 비관리자는 **조회 자체를 하지 않는 것이 맞다.**
  - 쓰이지 않는 호출 2건이 줄어든다.
  - 백엔드 최소화와 별개로 프론트도 최소 권한 원칙을 따른다.
  - 다만 현재 역할은 `getTeamUsers` 응답이 와야 알 수 있다. 그래서 같은 `Promise.all` 안에서는 조건을 걸 수 없다. **관리 탭을 처음 열 때 lazy로 조회**하는 방식(S7)을 택한다. 역할이 런타임에 바뀌는 경우도 자연스럽게 처리된다.
- 필요한 프론트 변경(S7):
  1. 초기 `Promise.all`에서 status 2건을 제거한다.
  2. 관리 탭에서 telegram 또는 discord 탭을 처음 열 때, `canManageInvites`이면 해당 status를 조회한다.
  3. 응답 타입을 `chatId?`·`webhookUrl?`로 optional화한다.
  4. `useTeamData.ts`는 G14에서 삭제한다. 삭제 승인이 안 나면 같은 방식으로 정리한다.
- 배포 순서: 프론트 S7은 백엔드 변경 전후 어느 쪽에서도 동작한다. 동시 배포는 필요 없다.

### 다음
- 실행계획과 질문 Q1~Q14는 [STATUS](STATUS.md)·[DECISIONS](DECISIONS.md)에 있다. bun-4a에 보고하고 답을 기다린다.

## 2026-10-15 (2차) — F-Q3 `access_token` HttpOnly 전환 조사

### 사실 (파일:라인)
1. **쿠키를 쓰는 곳**은 클라이언트 JS 하나뿐이다. `SessionProvider.tsx:30`의 `document.cookie`이고, `BackendAccessTokenCookieSync` effect 안에서 `useSession`의 `session.user.accessToken`을 복사한다.
   - 속성: `Path=/`, `Max-Age`=세션 남은 시간(없으면 30일), `SameSite=Lax`, https면 `Secure`, `NEXT_PUBLIC_COOKIE_DOMAIN`이 있으면 `Domain`.
   - 삭제: `:32`(세션이 없을 때, 같은 속성), `:42`(401일 때, `Secure`·`Domain` 없이).
   - `NEXT_PUBLIC_COOKIE_DOMAIN`은 `.env.build`·Dockerfile·workflow·infra 어디에도 없다. 그래서 **운영 번들에서는 undefined이고 host-only 쿠키가 된다**. G3(Domain 불일치)는 운영에서 실제로는 발생하지 않는다. 남는 것은 로컬 `.env`에 이 값을 설정했을 때뿐이다.
   - next-auth 콜백·route handler·서버에서 이 쿠키를 쓰는 곳은 없다. `src/lib/auth.ts`의 `access_token`은 카카오 OAuth의 `account.access_token`이며 이 쿠키와 무관하다.
2. **JS·서버에서 이 쿠키를 읽는 곳: 0건.** `document.cookie`를 읽는 곳, `next/headers` `cookies()`, 미들웨어(`src/middleware.*` 없음)가 모두 없다. `FetchService`의 `cookieHeader` 옵션을 쓰는 곳도 0건이다. 이 쿠키를 읽는 것은 백엔드 `JwtAuthGuard.extractToken`(쿠키 우선)과 로컬 Swagger(`addCookieAuth`, `../bun/src/main.ts:119-123`, LOCAL 전용)뿐이다.
3. **API 인증 전달 방식**
   - `backendFetch` 호출 28곳 모두 `accessToken`을 넘긴다. `FetchService.ts:95-96`이 `Authorization: Bearer`를 붙이고, `userService.ts:62`는 헤더를 직접 지정한다.
   - `credentials` 기본값은 `'same-origin'`이다(`FetchService.ts:106`).
   - 운영은 같은 출처라서 **쿠키와 Bearer가 둘 다 전송되고, 백엔드는 쿠키를 쓴다.** 로컬은 출처가 달라 쿠키가 가지 않고 **Bearer만** 쓴다. 로컬은 지금도 Bearer만으로 전부 동작한다.
   - 소켓 토큰은 `TeamSocketContext.tsx:127-128`의 `auth.token = session.user.accessToken`이다. 쿠키와 무관하다.
4. **도메인 관계**
   - 운영: `NEXT_PUBLIC_API`(.env.build)의 origin이 사이트 origin(`siteConfig.ts:8` 기본값)과 **같다**. 리버스 프록시가 경로로 나누는 **same-origin** 구조다. 상위 도메인은 공개 접미사(PSL) 등재로 알려져 있어, 같은 상위 도메인의 다른 서브도메인은 cross-site로 취급된다.
   - 로컬: 프론트와 백엔드의 host·port가 달라 cross-origin이다.
   - SameSite=Lax 쿠키는 운영에서 same-origin 요청에 실리고, 외부 사이트의 POST에는 실리지 않는다.
5. **핵심 제약**: 백엔드 토큰은 `session.user.accessToken`으로 **JS에 이미 노출돼 있다**(`types/next-auth.d.ts:9`, `/api/auth/session` 응답). 소켓 인증도 이 값이 JS에 있어야 동작한다. 따라서 쿠키만 HttpOnly로 바꿔도 XSS 공격자는 `/api/auth/session`에서 같은 토큰을 읽을 수 있다.

### 후보 비교
| 안 | 방법 | 보안 효과 | 부작용 |
|---|---|---|---|
| (가) Next 서버가 HttpOnly Set-Cookie | next-auth `jwt` 콜백이나 route handler에서 `cookies().set(httpOnly)`, `events.signOut`에서 삭제 | **거의 없음**. 같은 토큰이 세션 JSON·JS에 남는다 | 쿠키 수명과 세션 수명을 따로 맞춰야 한다. 로그아웃·401 때 서버 경로로 삭제해야 한다. 쿠키 인증이 남아 CSRF 표면이 그대로다. 미커밋 WIP가 있는 `src/lib/auth.ts`를 함께 고쳐야 한다 |
| **(나) 쿠키 제거, Bearer로 일원화** | 프론트는 쿠키 쓰기를 멈추고 기존 쿠키를 정리한다. 백엔드는 Bearer를 먼저 보고, 이후 쿠키 폴백을 제거한다 | **실질 감소**. 30일짜리 JS 쿠키가 사라진다. 쿠키 인증이 없어 CSRF 표면이 사라진다. "쿠키 우선"이라 생기는 stale 토큰 인증 위험도 사라진다 | 기능 영향 없음: API 28곳·소켓이 이미 Bearer다. 로컬은 이미 Bearer만 쓴다. 전환 직후 브라우저에 남은 기존 쿠키를 정리해야 한다(아래 주의). 로컬 Swagger 인증 방식을 Bearer로 바꿔야 한다 |
| (다) 백엔드가 발급 | 로그인 응답에 Set-Cookie | — | **불가에 가깝다**. 백엔드 로그인은 Next 서버의 `jwt` 콜백이 서버 간으로 호출한다. 그래서 Set-Cookie는 브라우저가 아니라 Next 서버에 도착한다. 중계하면 결국 (가)가 되고 같은 한계가 있다 |
| (참고) BFF | 토큰을 세션에서 빼고 모든 API를 Next route handler로 프록시한다. 소켓은 HttpOnly 쿠키로 인증한다 | 가장 크다. 토큰이 JS에 없다 | 대규모 구조 변경이다. 서비스 전부, 소켓 인증, CSRF 토큰 도입이 필요하다. 별도 프로젝트 규모 |

### 주의 — 쿠키 우선 순위 때문에 생기는 전환 위험
- 지금 `extractToken`은 쿠키가 있으면 **Bearer를 보지 않는다**. 쿠키 토큰이 무효여도 Bearer로 넘어가지 않는다(`jwt-auth.guard.ts:52-57`).
- 프론트가 쿠키 갱신을 멈춘 상태에서 정리에 실패한 오래된 쿠키가 남으면, 백엔드가 그 쿠키를 써서 401을 낸다. 그러면 `backend:unauthorized` → signOut이 반복된다. 다른 계정의 토큰이 남아 있으면 그 계정으로 인증된다.
- 대응:
  1. 백엔드를 **Bearer 우선**으로 먼저 바꾼다.
  2. 프론트는 기록할 때와 같은 속성으로 쿠키 정리를 한시적으로 유지한다(최대 Max-Age 30일).

### 권장안: (나), 3 슬라이스
| 순서 | 레포 | 슬라이스 | 내용 | 검증 | 롤백 |
|---|---|---|---|---|---|
| 1 | 백엔드 | B-1 `fix(auth): JWT 추출을 Bearer 우선으로` | `extractToken`이 Bearer를 먼저 보고 쿠키는 폴백으로 둔다. Swagger에 `addBearerAuth` 추가. spec에 "둘 다 있으면 Bearer" 케이스 추가 | `pnpm ci:core` | revert. 현재 프론트와 호환된다(두 값이 같은 토큰) |
| 2 | 프론트 | F-1 `fix(auth): access_token 쿠키 기록 중단, 기존 쿠키 정리` | `BackendAccessTokenCookieSync`의 기록을 제거한다. 마운트 1회와 401 경로에서 `clearLegacyAccessTokenCookie()`를 실행한다. 이 함수는 기록할 때와 같은 Path·SameSite·Secure·Domain(설정됐으면)으로 `Max-Age=0`을 쓴다. 정리 코드 제거 시점(배포 + 30일)을 TODO와 STATUS에 남긴다. S5의 쿠키 헬퍼는 이것으로 대체하고, signOut 1회 가드(G4)는 S5에 그대로 둔다 | 쿠키 문자열 생성 단위 테스트, lint·typecheck·test:run. 브라우저에서 로그인 → 쿠키 없음 확인, 기존 쿠키 삭제 확인은 수동(미검증 표기) | revert하면 쿠키 기록이 돌아온다 |
| 3 | 백엔드 (배포 + 30일 뒤) | B-2 `refactor(auth): 쿠키 인증 폴백 제거` | `extractToken`에서 쿠키 분기를 제거한다. Swagger `addCookieAuth`를 제거한다 | `pnpm ci:core` | revert |
- 동시 배포는 필요 없다. 권장 순서는 B-1 → F-1이다. F-1이 먼저 나가도 쿠키가 지워지면 백엔드가 Bearer를 쓰므로 동작한다. 다만 정리하지 못한 쿠키가 남는 경우를 B-1이 막아준다.
- 로컬 개발: 영향 없음(이미 Bearer).
- 토큰 갱신·세션 만료: 지금은 갱신이 없다. 세션과 토큰 모두 30일이고 바뀌는 것도 없다. 쿠키와 세션의 만료 불일치 문제는 쿠키가 사라지면서 같이 해소된다.
- CSRF: (나) 이후 백엔드 HTTP 인증이 헤더로만 이뤄지므로 CSRF 토큰은 필요 없다. B-2 전까지는 지금과 같다(SameSite=Lax).
- 남는 위험: XSS가 일어나면 세션 JSON의 토큰이 탈취될 수 있다. 이건 (가)·(나) 모두 같다. 근본 해결은 BFF이고 별건이다.

## 2026-10-15 (3차) — `/time-measurement` UI 전수조사

- 범위: `src/app/time-measurement/`의 `layout.tsx`, `page.tsx`(311줄), `components/` 4종(tsx와 module.css)을 전부 정독했다. 공용 의존은 `TeamsPageLayout`, `cardStyles.section`(`bg-slate-900/80`, blur 없음), `useSafeNavigation`이다.
- 검증 방식: **정적 분석만 했다. 화면은 미검증이다.** 이 세션에는 브라우저 도구가 없어 dev 서버를 띄워도 화면을 확인할 수 없다. 로그인은 필요 없는 공개 페이지라 사용자가 `bun run dev` 후 확인할 수 있다.
- 구조: 시작·종료 시각(`HH:MM`, URL 파라미터)을 기준으로 오늘의 벽시계 시간을 계산한다. `setInterval(1000)`마다 `new Date()`로 다시 계산하므로 누적 오차는 없다. 진행률은 `progress`(0~100)이고, 애니메이션 4종이 이 값을 표시한다.
- 레포 Never 위반(`backdrop-blur`)은 0건이다. 레포 전체에 `prefers-reduced-motion`·`motion-reduce`·`tabular-nums` 사용이 0건이다.

| # | 항목 | 파일:라인 | 근거·재현 | 분류 | 수정안 |
|---|---|---|---|---|---|
| TM1 | 시작=종료일 때 0으로 나눠 `NaN%` 표시 | `page.tsx:66-73,169,200` | 시작·종료를 같은 시각으로 두면 `totalWorkSeconds=0`이 되고 `progress`는 NaN/Infinity가 된다. NaN은 클램프 비교를 통과해 `toFixed(2)`가 "NaN"을 출력한다 | A (버그) | 계산을 순수 함수로 빼고 total≤0을 가드한다. 입력은 유효성 메시지를 띄운다(TM-Q1 답에 따라) |
| TM2 | 시간 입력을 비우면 `NaN:NaN:NaN` | `page.tsx:103-113,59-64` | `type=time`의 지우기 버튼이나 백스페이스로 값이 `""`가 되면 `split(":")`가 NaN이 되고 `setHours(NaN)`이 Invalid Date를 만든다. 빈 값이 URL에도 들어간다 | A (버그) | 빈 값과 형식 오류는 state·URL에 반영하지 않는다(직전 유효값 유지) |
| TM3 | URL `?startTime=9:00`처럼 한 자리 시(hour)면 입력칸이 비어 보임 | `page.tsx:42` | 정규식이 `[0-1]?[0-9]`라 `9:00`을 허용한다. 그런데 `<input type=time>`의 value는 `09:00` 형식만 받아 빈칸으로 렌더된다. 계산은 9시로 되므로 표시와 실제가 어긋난다 | A (버그) | 파싱 후 `padStart(2,"0")`로 정규화한다 |
| TM4 | 배터리 숫자와 채움이 반대 의미 | `BatteryAnimation.tsx:10,25,29-30` | 채움 높이는 남은 비율(`100-progress`)인데 숫자는 경과(`progress`) + 라벨 "charge"다. 진행 80%이면 20%만 차 있는데 "80% charge"로 읽힌다 | B | 권장: 숫자를 남은 비율로 바꾸고 라벨을 "남음"으로 한다(TM-Q2) |
| TM5 | 첫 진입마다 애니메이션이 0에서 현재값으로 쓸려 감 + 0.00% 깜빡임 | `page.tsx:47-49`, `Battery.module.css:49`, `Ring.module.css:35`, `Orbit.module.css:22`, `Wave.module.css:50`, `page.tsx:173` | 첫 렌더는 `progress=0`이다. effect가 실제 값을 넣으면 각 transition(0.35~0.6s)이 0부터 재생된다. 배터리는 가득 찼다가 줄고, 링·오비트는 0부터 돈다 | A | 첫 측정 전에는 transition을 끈다(`data-ready` 플래그). 또는 초기값을 lazy 계산한다(Suspense 안이라 SSR 불일치 위험이 낮음, 확인 필요) |
| TM6 | "남은 시간" 섹션이 마운트 뒤에 나타나 아래 설정 섹션을 밀어냄 (CLS) | `page.tsx:181`, 스켈레톤 `:265-303` | `timeLeft`가 null인 동안 섹션이 없다. 스켈레톤에도 이 섹션과 애니메이션 선택 블록이 없어 로드 직후 두 번 점프한다 | A | `--:--:--` 자리 표시로 섹션을 항상 렌더한다. 스켈레톤 구조를 실제와 맞춘다 |
| TM7 | 1초 타이머가 초 경계와 정렬되지 않아 초 표시가 가끔 2초 건너뛰거나 늦게 바뀜 | `page.tsx:97-100` | `setInterval(1000)`은 마운트 시점 기준이고 지연이 누적된다(계산은 매번 `Date` 기준이라 값은 맞다). 비활성 탭에서 돌아오면 다음 tick까지 옛 값이 보인다 | A | 다음 초 경계까지 `setTimeout(1000 - now%1000)`을 재귀로 건다. `visibilitychange` 때 즉시 다시 계산한다. cleanup을 유지한다 |
| TM8 | 숫자 폭이 변해 텍스트가 흔들림 | `page.tsx:169,194,200`, 각 `.percent`·`.value` | 진행률 `9.99→10.00`, 분 `1,000`처럼 자릿수가 변한다. 비례폭 글꼴이라 `tabular-nums`가 없다(남은 시간은 `font-mono`라 괜찮다) | A | `tabular-nums`를 적용한다(Tailwind 클래스, CSS `font-variant-numeric`) |
| TM9 | layout 속성 transition | `page.tsx:173` `transition-all`+`width`, `Battery.module.css:49` `height`, `Wave.module.css:50` `height` | 매 초 width·height 변경으로 레이아웃이 다시 계산된다. 배터리 `background` 그라데이션은 transition되지 않아 50%·20% 경계에서 색이 뚝 바뀐다 | A | 진행바와 배터리는 `transform: scaleX/scaleY`(origin 지정)로 바꾼다. 색은 두 레이어를 opacity로 교차하거나 단색 `background-color`를 transition한다 |
| TM10 | 무한 애니메이션이 paint 비용이 큰 속성 사용 | `Orbit.module.css:45-55` `box-shadow`, `Ring.module.css:36-47` `filter: drop-shadow` | 장시간 켜 두는 타이머 페이지인데 매 프레임 repaint가 일어나 모바일 배터리를 소모한다(측정 안 함) | A | 글로우를 별도 레이어(pseudo-element)의 `opacity` 애니메이션으로 바꾼다 |
| TM11 | `prefers-reduced-motion` 미대응 | CSS 모듈 4개 전부 | 무한 펄스·쉬머·웨이브가 항상 동작한다 | A | 각 모듈에 `@media (prefers-reduced-motion: reduce)`를 넣어 infinite 애니메이션을 끄고 transition을 최소화한다 |
| TM12 | 시간 입력 변경마다 `router.push` | `page.tsx:112` | 시간 스피너를 돌리거나 칸을 바꿀 때마다 히스토리가 쌓여 뒤로가기가 입력 이력을 거슬러 간다. 기본 `scroll` 동작으로 스크롤이 튈 가능성이 있다(미검증) | B | 권장: `router.replace(..., { scroll:false })` (TM-Q3) |
| TM13 | 애니메이션 선택이 새로고침하면 배터리로 초기화 | `page.tsx:50` | 시각은 URL로 유지되지만 애니메이션은 로컬 state다 | B | 권장: `?anim=` URL 파라미터로 둔다. 유효값만 받는다(TM-Q4) |
| TM14 | 종료 < 시작(야간 근무)을 지원하지 않음 | `page.tsx:58-75` | 22:00→06:00으로 두면 종료가 오늘 06:00으로 해석된다. 이 경우 22시 이후 진입하면 즉시 "완료"가 되고 진행률이 음수 분모로 계산된다 | B | 권장: 종료 ≤ 시작이면 종료를 다음 날로 해석한다(TM-Q1) |
| TM15 | 시작 전에도 "남은 시간"이 종료까지 남은 전체 시간으로 표시됨 | `page.tsx:87-94` | 07:00에 09~18로 두면 진행률은 0%이고 "남은 시간 11:00:00"이 표시된다. 시작 전이라는 표시가 없다 | B | 권장: "시작 전" 상태를 표시하고 "시작까지 HH:MM:SS"를 보여 준다(TM-Q5) |
| TM16 | 완료 시 남은 시간 섹션이 사라져 레이아웃이 크게 줄어듦 | `page.tsx:157-163,181` | 완료되면 애니메이션 자리가 텍스트로 바뀌고 섹션 하나가 통째로 빠진다 | B | 권장: 섹션은 유지하고 `00:00:00`과 "완료" 배지를 보여 준다. 애니메이션은 100% 상태를 유지한다(TM-Q5) |
| TM17 | 진행률이 같은 화면에 두 번 표시됨 | `page.tsx:169`, `:198-201` | 진행바 옆과 통계 그리드 두 번째 칸에 같은 값이 중복된다. 헤더의 시작·종료 칩도 아래 입력값과 중복이다 | B | 권장: 통계 칸을 "경과 시간"으로 바꾼다. 헤더 칩은 유지한다(TM-Q6) |
| TM18 | 영문·음역 라벨 | `page.tsx:143` "Time Tracker", `:136` "오비트"·"웨이브", 컴포넌트 라벨 "charge"·"orbit"·"wave"·"focus" | 한국어 UI 규약과 다르다. 보드 쪽 Q13은 한국어화로 확정됐다 | B | 권장: 한국어로 바꾼다(예: 궤도·파도·링, 남음·경과)(TM-Q7) |
| TM19 | 진행바에 `role="progressbar"` 없음, 장식 애니메이션이 스크린리더에 읽힘 | `page.tsx:171-176`, 애니메이션 컨테이너 `:156` | "37% charge" 같은 장식 텍스트가 중복으로 읽힌다 | A | 진행바에 `role="progressbar" aria-valuenow/min/max aria-label="진행률"`을 단다. 애니메이션 영역은 `aria-hidden` |
| TM20 | 애니메이션 선택 그룹 시맨틱·터치 타깃 | `page.tsx:242-257` | 제목이 `<p>`라 그룹과 연결되지 않는다. 버튼은 `py-2.5 text-sm`이라 약 40px로 44px보다 작다 | A | `role="group" aria-labelledby`를 단다. `min-h-[44px]`로 맞춘다(보드에서 확정한 Q12와 같은 원칙) |
| TM21 | 렌더마다 상수 객체를 다시 생성 | `page.tsx:115-137` | `animationComponents`·`animationOptions`·`formatTime` | A (경미) | 모듈 스코프로 옮긴다 |
| TM22 | Wave 박스 폭이 좁은 화면에서 카드 안쪽을 넘을 수 있음 | `Wave.module.css:2` `min(280px, 90vw)` | 360px 폭에서 페이지 px-4와 카드 p-4를 빼면 가용 폭이 약 296px로 빠듯하다. 더 좁은 기기(320px)에서는 넘친다(미검증) | A | `width: 100%; max-width: 280px` |
| TM23 | (선택) 탭 제목에 남은 시간 표시 없음 | — | 다른 탭에 있을 때 확인할 수단이 없다. 새 기능이다 | B | 권장: 이번 범위 밖(TM-Q8) |

### 슬라이스 제안 (STATUS에 S19~S22로 반영)
- S19 (A) `fix(time): 시간 계산을 순수 함수로 분리하고 0 나눗셈·빈 입력·한 자리 시 정규화` — TM1~3, TM21. `src/app/utils/timeRange.ts`와 테스트(node 환경, 경계값 케이스). 야간 처리는 TM-Q1 답에 따라 같은 함수에 넣는다
- S20 (A) `fix(time): 첫 페인트 sweep·레이아웃 이동 제거, 초 경계 정렬 tick` — TM5~7. 스켈레톤 동기화
- S21 (A) `perf(time): 애니메이션을 transform·opacity 기반으로, reduced-motion 대응, tabular-nums` — TM8~11, TM22
- S22 (A) `fix(time): 진행바·선택 그룹 접근성` — TM19·20
- S23 (B, 답변 후) — TM4, TM12~18, TM23
- 검증: lint·typecheck·test:run, S19는 단위 테스트를 추가한다. 화면은 사용자가 `bun run dev` → `/time-measurement`에서 확인한다(모바일 폭, reduced-motion 설정, 시작=종료, 빈 입력, `?startTime=9:00`). 각 슬라이스는 1커밋이라 revert로 롤백한다

## 2026-10-15 — 구현 (착수 승인: bun-4a 경유, 커밋 금지)

> 커밋하지 않고 작업트리에 쌓는다. 슬라이스별 변경 파일과 커밋 초안을 여기 남겨, 사용자가 커밋을 지시하면 이대로 나눈다.

### S13 — `/api/test` 삭제
- 변경 파일: `src/app/api/test/route.ts` 삭제(디렉토리 포함). 삭제 직전 `src`·`next.config`·`.github`·`infra`·`Dockerfile`에서 `api/test` 참조가 0건인 것을 다시 확인했다
- 후속(범위 밖): `.env.build`의 `NEXT_PUBLIC_TEST`는 이제 사용처가 없다. 정리 여부는 별건이다
- 검증:
  - lint 에러 0 · 경고 4(기준선 동일)
  - typecheck 통과. 다만 build 전에는 이전 빌드가 남긴 `.next/types/app/api/test`에서 TS2307 에러가 났다. 로컬 산출물 문제라 build 후 사라졌고, CI는 매번 새로 checkout하므로 해당 없다
  - build: sandbox 밖에서 통과. 라우트 목록에서 `/api/test`가 빠진 것을 확인했다
- 커밋 초안: `chore(api): CI env 테스트용 /api/test 라우트 삭제` / 본문: 인증 없이 서버 env(TEST·TEST2)를 응답·로그하던 2025-07 CI 테스트 라우트. 참조 0건

### S12 (1/3) — 배포 완료 대기와 UpdateStatus 판정
- 변경 파일: `.github/workflows/oci_build_and_deploy_next.yml` (deploy 단계 script)
- 내용:
  - `set -euo pipefail`
  - `timeout 900 docker stack deploy --detach=false`. 실패하거나 시간을 넘기면 `fail`
  - 이어서 `UpdateStatus.State`를 폴링한다
    - `completed`면 성공
    - `updating`·`rollback_started`면 계속 기다린다
    - 그 밖의 상태(`rollback_completed`·`paused` 등)는 `docker service ps`를 출력하고 `exit 1`
    - UpdateStatus가 없으면(서비스 최초 생성) Replicas가 N/N일 때 성공
    - 전체 상한은 15분
  - 원격 셸은 bash를 전제한다. 기존 스크립트가 이미 bash 전용 `$SECONDS`를 쓰고 있었다
- 검증:
  - YAML 파싱 OK, `bash -n` OK
  - `actionlint`: 이 변경과 무관한 기존 경고 1건(:65 SC2086 info)만 있다. C8 커밋에서 정리한다
  - **docker를 스텁으로 바꿔 시나리오 6종을 모의 실행했다**
    - `completed` → rc 0
    - `rollback_completed` → rc 1
    - `paused` → rc 1
    - `updating→completed` → rc 0
    - 최초 생성(빈 상태, 4/4) → rc 0
    - 계속 `updating` → 15분 상한 초과로 rc 1
  - 실제 배포는 미검증이다. 다음 main 배포 로그에서 `--detach=false` 경고가 사라지는지, `Update completed`가 찍히는지 확인한다
- 커밋 초안: `fix(ci): stack deploy 완료를 기다리고 UpdateStatus로 성공 판정` / 본문: detach 없이 Replicas만 세면 교체 전 태스크를 세어 실패 배포도 success였다(run 38530773208). 롤백·일시정지는 실패로 판정한다

### S24 — 레플리카와 swarm 업데이트 설정
- 변경 파일: `infra/docker-stack.app.yml`
  - `replicas 10→4`
  - `update_config.monitor 10s→60s`
  - `restart_policy.delay: 10s` 추가
  - parallelism 1·start-first·rollback은 유지, 재시작 상한은 넣지 않았다(D-INFRA-restart)
- 검증: YAML 파싱 후 값을 확인했다. 실제 반영은 S12가 들어간 첫 배포에서 4/4와 `Update completed`로 확인한다(미검증)
- 커밋 초안: `chore(infra): 프론트 레플리카 4로 축소, swarm 업데이트 monitor 60s·재시작 간격`

### 기준선 메모
- `test:run`은 S1 전까지 계속 17건 실패한다. 모두 `.claude/worktrees/**/node_modules`에서 생긴다. `src` 테스트는 전부 통과한다

### S12 보강 — 이전 배포의 UpdateStatus 오판 방지 (bun-4a 대조 의견 반영)
- 배포 직전 `DEPLOY_STARTED=$(date -u +%s)`를 기록한다. `UpdateStatus.StartedAt`이 그보다 이전이면 이번 배포가 시작한 업데이트가 아니라고 본다(같은 SHA 재실행 등). 이때는 상태값 대신 Replicas N/N으로 판정한다
- StartedAt이 nil이면 템플릿이 실패하므로 `{{if .UpdateStatus}}{{if .UpdateStatus.StartedAt}}…{{else}}0{{end}}{{else}}0{{end}}`로 막는다
- 반영 이유: 롤백 직후 같은 SHA로 다시 실행하는 일이 실제로 흔하다. 이때 남아 있던 `rollback_completed`로 실패 오판이 나는 것을 막는다
- 검증(스텁 9종): 새 업데이트의 completed·rollback·paused·updating→completed·상한 초과는 앞과 같다. 이전 값 `rollback_completed`·`completed` + 4/4는 성공. 이전 값 + 0/4는 상한 초과로 실패

### S1 — vitest 수집 범위·setup
- 변경 파일:
  - `vitest.config.mts`: exclude에 `**/node_modules/**`·`.next/**`·`.claude/**` 추가, `setupFiles` 연결, `esbuild.jsx: 'automatic'` 추가. 마지막 것은 S10 훅 테스트 때 넣었다. tsconfig `jsx: preserve` 때문에 테스트 JSX가 `React is not defined`로 실패했다
  - `.claude/rules/tests.md`: 설정 설명을 갱신했다
- 검증: test:run 5 files/100 tests 통과. 17건 실패 해소(worktree 미수집)
- 커밋 초안: `chore(test): vitest 수집에서 worktree 제외, jest-dom setup·JSX 자동 런타임 연결`

### S2 — 탭 전환 stale 응답 (V1)
- 변경 파일: `TeamBoard.tsx`
  - `taskFetchSeqRef`: 최신 조회만 `setTasks`. 팀이 바뀌거나 언마운트하면 무효화
  - `loadingSeqRef`: 마지막 로딩만 스켈레톤을 걷는다
- 검증: lint·typecheck. 화면은 미검증(로그인 필요)
- 커밋 초안: `fix(teams): 탭 전환 시 늦게 온 태스크 응답이 최신 목록을 덮어쓰지 않게`

### S3 — 소켓 생성 이벤트 탭 필터·중복 (V2·G7)
- 변경 파일:
  - `taskUtils.ts`: `shouldInsertCreatedTask` 추가
  - `taskUtils.test.ts`: +3 케이스
  - `TeamBoard.tsx`: `tasksRef`로 현재 목록 대조, deps에 `dataTab` 추가
  - `TaskDetailPage.tsx`: 같은 `commentId` 무시. 토스트 id로 중복 토스트 방지
- 검증: test:run 103 통과
- 커밋 초안: `fix(teams): 보관함 탭 소켓 태스크 오삽입과 태스크·댓글 중복 추가 방지`

### S4 — 캘린더 팝오버·칸반 (V3·V5·V4)
- 변경 파일:
  - `CalendarView.tsx`: 월 이동·오늘 버튼에서 팝오버 닫기, Esc 닫기
  - `Kanban.tsx`:
    - 복원 스크롤을 `useLayoutEffect`로
    - 탭 클릭 smooth 스크롤은 목표 위치에 도착하면 감지를 재개한다. 1초 안전 해제 타이머는 cleanup한다
- 검증: lint·typecheck. 실기기(iOS) 미검증
- 커밋 초안 2개: `fix(teams): 캘린더 월 이동·Esc 시 팝오버 닫기` / `fix(teams): 칸반 복원 컬럼 깜빡임과 탭 이동 중 활성 탭 흔들림 수정`

### S5 — signOut 1회 (G4)
- 변경 파일: `SessionProvider.tsx`. 동시 401에도 `signOut`을 한 번만 호출한다. 쿠키 코드는 그대로 둔다(D-F-Q3 보류)
- 커밋 초안: `fix(auth): 401 동시 다발 시 signOut 1회만`

### S6 — 재연결 (G5·G6)
- 변경 파일:
  - `TeamBoard.tsx`·`TaskDetailPage.tsx`: 마운트 이후 `roomJoinCount`가 늘면(재입장) 조용히 다시 조회한다. 기준값 ref로 판단하므로 eslint-disable 없이 deps를 전부 넣었다
  - `TeamSocketContext.tsx`·`FishingSocketContext.tsx`: `reconnect` 타이머를 `connectTimerRef`에 두어 언마운트 시 취소된다
- 검증: lint·typecheck. 재연결 시나리오는 미검증
- 커밋 초안: `fix(teams): 소켓 재연결 후 보드·상세 재조회, 재연결 타이머 정리`

### S7 — 연동 상태 지연 조회 (조사 c)
- 변경 파일:
  - `TeamBoard.tsx`: 초기 `Promise.all`에서 status 2건과 미사용 setter·import를 제거했다
  - `TeamManagementSection.tsx`: telegram·discord 탭을 처음 클릭할 때 조회한다. 클릭 핸들러 안에서 호출해 로딩 상태가 같은 렌더에 켜진다
  - `teamService.ts`: `chatId?`·`webhookUrl?`를 optional로 바꿨다
- 검증: typecheck. 관리자 화면은 미검증
- 커밋 초안: `refactor(teams): 연동 상태는 관리 탭 진입 시 관리자만 조회`

### S8 — 정리 묶음 (V6·V19·V22·G15·G16·G8)
- 변경 파일:
  - `Skeleton.tsx`·`components/index.ts`: `CalendarViewSkeleton`·`GanttViewSkeleton` 추가
  - `TeamBoard.tsx`: 보기별 스켈레톤
  - `boardStateStorage.ts`: `VIEW_MODES` export(SSOT)
  - `ViewModeToggle.tsx`: 타입을 위 파일에서 가져온다
  - `TeamBoard.tsx`: `validViewModes` 제거
  - `ListView.tsx`: `renderSortIcon`, `showRestore` 조건 통일
  - `globals.css`: 미사용 `.mobile-kanban-*` 삭제
  - `utils/jsonLd.ts`(+test 2): JSON-LD 9곳을 `serializeJsonLd`로. 대상은 `page.tsx`, `fishing/guide`·`[fishId]`·`about`, `TeamsLanding.tsx`
  - `TaskDetailPage.tsx`: 성공 메시지 타이머 ref·cleanup, 삭제 후 죽은 catch 제거
  - `invite/accept/page.tsx`: `acceptStartedRef`로 1회 수락, 리다이렉트 타이머 cleanup
  - `useSafeNavigation.ts`: `getParam` 메모이즈
- 범위에서 뺀 것(후속):
  - `useAuthenticatedFetch` 취소
  - `edit/page.tsx` 팀 조회(백엔드 API 확인 필요)
  - Kanban scroll 리스너 통합과 resize 대응
  - 검색어 저장 디바운스
- 검증: test:run 105 통과
- 커밋 초안 4개: `feat(teams): 캘린더·타임라인 로딩 스켈레톤` / `refactor(teams): 보기 방식 목록을 boardStateStorage 하나로` / `fix(seo): JSON-LD 직렬화 시 < 이스케이프` / `fix: 초대 수락 1회 보장·성공 메시지 타이머 정리 외`

### S9 — backdrop-blur 제거 (V20)
- 변경 파일:
  - `styles/teams.ts` `viewContainerStyles`: `bg-white/5 … backdrop-blur-xl` → `bg-slate-900/80`(blur 없음)
  - `StatusDropdown.tsx`: `backdrop-blur-sm` 제거
  - `Skeleton.tsx` 리스트·캘린더·간트 스켈레톤 배경도 `bg-slate-900/80`으로 맞췄다
- `src` 전체에서 `backdrop-blur`·`backdrop-filter`는 0건이다(UserAvatar 주석 제외)
- 시각 변화: 리스트·캘린더·타임라인 카드 배경이 반투명 흰색에서 카드 섹션과 같은 어두운 반투명으로 바뀐다. 사용자 확인이 필요하다
- 커밋 초안: `style(teams): 뷰 컨테이너·상태 드롭다운의 backdrop-blur를 반투명 배경으로 교체`

### S10 — 접근성 시맨틱 (크기·레이아웃 불변)
- 변경 파일:
  - 신규 `hooks/useDialog.ts`(+jsdom 테스트 5): Esc·초기 포커스·Tab 트랩·포커스 복원. `hooks/index.ts` export 추가
  - 적용한 곳은 `ConfirmModal`·`InviteModal`·`RoleChangeModal`이다. 여기에 `role="dialog" aria-modal aria-labelledby`를 달았고, 처리 중에는 Esc를 막는다
  - `ChatReadersModal`·`OnlineUsers` 모달에도 적용했다
  - `ViewModeToggle.tsx`: `role="group"` 라벨 2개
  - `CalendarView.tsx`:
    - ◀▶ `aria-label`
    - 태스크 항목·멀티데이 바·날짜 미지정·팝오버 항목에 `role="button" tabIndex=0`과 Enter/Space
  - `ListView.tsx`: 정렬 헤더를 `th[aria-sort] > button`으로
  - `Kanban.tsx`: 인디케이터에 `aria-current`
  - label 연결:
    - `InviteModal` select·input
    - `TaskFilters` 검색·담당자
    - `DiscordSection`
    - `mypage` 닉네임
    - `TaskDetailPage` 댓글 작성·수정
    - 낚시 `ChatPanel`
- 범위에서 뺀 것(후속):
  - 낚시 모달 3종(`TutorialGuide`·`FishResultModal`·`InventoryPanel`)
  - `TeamChatPanel`의 문서 레벨 Esc. 위에 `ChatReadersModal`이 겹치면 Esc 리스너 순서상 둘 다 닫힐 수 있어 따로 설계해야 한다
  - 칸반 비활성 컬럼 `inert`. 스와이프 중 탭 가능 여부 실기기 확인이 필요하다
- 검증: test:run 7 files/110 통과
- 커밋 초안: `feat(a11y): 공용 useDialog 훅` / `fix(a11y): 모달·캘린더·리스트·입력 라벨 접근성`

### 커밋 분리 메모
- `TeamBoard.tsx`(S2·S3·S6·S7·S8)와 `TaskDetailPage.tsx`(S3·S6·S8·S10)는 여러 슬라이스가 같은 파일을 고쳤다. 커밋을 지시받으면 `git add -p`로 hunk 단위로 나눈다

### S12 보강 2 — ssh-action 세션 시간 (bun-4a 공유, 백엔드 리뷰 지적)
- `appleboy/ssh-action`의 `command_timeout` 기본값은 10m이다. 스크립트 대기 상한 15분보다 먼저 세션이 끊기므로 `command_timeout: 20m`으로 늘렸다
- `docker service inspect` 실패는 `|| fail "service inspect 실패"`로 직접 처리했다. 그래서 `set -e` 때문에 진단 출력 없이 끝나지 않는다
- 검증: 스텁 시나리오에 inspect 실패를 추가했다(rc 1, 진단 출력). 기존 시나리오도 다시 통과했다

### S12 (2~3/3) — CI 안전성 나머지 (C2·C5·C6·C8·C9·C10·C11·C13·C16)
- `oci_build_and_deploy_next.yml`
  - `pull_request`(main·develop) 트리거를 추가했다. deploy는 `if: github.event_name != 'pull_request'`로 막는다
  - push와 PR의 `paths-ignore`에 `.claude/**`를 넣었다
  - 최상위에 `permissions: contents: read`
  - deploy job에 `concurrency: deploy-prod-next`(cancel-in-progress false)
  - docker login·rsync 단계의 시크릿을 `env:`로 넘긴다
  - short SHA는 `${GITHUB_SHA::7}`로 바꿔 기존 SC2086을 해소했다
  - `appleboy/ssh-action`을 커밋 SHA `55dabf8…`(v1.0.0 태그 실측)로 고정했다
- 신규 `.github/dependabot.yml`: github-actions 주간 갱신, 대상 브랜치 develop
- `.dockerignore`: `**/node_modules`·`.git`·`.github`·`.next`·`.claude`·`docs`·`coverage`·`*.tsbuildinfo`를 추가했다. `.env.build`는 빌드에 필요하므로 `.env`만 막는다
- `Dockerfile`
  - bun install과 `bun run build`에 BuildKit cache mount를 걸었다
  - production 스테이지에 `COPY --chown=bun:bun`과 `USER bun`(C11)을 넣었다
- 보류(D-HOLD) 그대로: C1, C14, C4
- 검증: `actionlint` 경고 0, dependabot YAML 파싱 OK
  - **Docker 빌드는 미검증**이다. docker 명령은 승인 대상이라 돌리지 않았다
  - 다음 CI 실행에서 확인할 것: 빌드 성공(cache mount·USER bun), 배포 healthcheck 통과(비root로 `server.js`·`/api/health` 동작)
  - C11은 문제가 생기면 swarm `failure_action: rollback`이 자동 롤백한다
- 커밋 초안: `chore(ci): PR verify·권한 최소화·배포 직렬화·시크릿 env 전달·ssh-action SHA 고정` / `chore(ci): Dependabot으로 액션 버전 갱신` / `chore(docker): 빌드 캐시 마운트와 dockerignore 보강` / `chore(docker): 비root(bun) 사용자로 실행`

### S11 — 테스트 확충 (서브에이전트, 테스트 파일만)
- 신규:
  - `services/FetchService.test.ts`(29)
  - `services/FetchService.browser.test.ts`(jsdom, 6)
  - `utils/taskUtils.deadline.test.ts`(18)
  - `config/taskStatusConfig.test.ts`(12)
  - `config/roleConfig.test.ts`(9)
  - `utils/errorUtils.test.ts`(7)
  - `services/teamService.test.ts`(7)
- 확장: `utils/dateUtils.test.ts`(7→29). 시간대 4종(Seoul·New York·UTC·Auckland)에서 통과했다
- 발견한 프로덕션 버그 의심(고치지 않음, **후속**):
  1. `dateUtils.ts:21` daysBetween, `taskUtils.ts:41·124`: DST 종료일에 `Math.ceil` 때문에 하루가 더 나온다. KST는 해당 없고 해외 시간대만 영향을 받는다. `Math.round`가 맞다
  2. `FetchService.ts:246`: 소문자 `content-type`을 넘기면 JSON Content-Type이 중복으로 붙는다
  3. `FetchService.ts:253`: URLSearchParams·ArrayBuffer body에도 JSON 헤더가 붙는다(현재 이런 호출부가 있는지는 미확인)
  4. `teamService.ts:35·64`: JSON이 아닌 오류 본문(HTML 502 등)이 그대로 토스트 메시지가 된다. 상태 코드 매핑이 FetchClient와 다르다
- 커밋 초안: `test: FetchClient·teamService·날짜·설정·에러 유틸 단위 테스트`

### S14 — `pnpm-lock.yaml` 삭제 (D-F-Q5)
- 추적 파일 중 pnpm 참조는 백엔드 형제 레포용 설정·훅뿐이다
- 커밋 초안: `chore: 사용하지 않는 pnpm-lock.yaml 삭제`

### S15 — 보드 상태 (V7·V9·V10·V11)
- `boardStateStorage.ts`
  - `calendarMonth`('YYYY-MM' 검증)·`listSort` 필드를 추가했다
  - 복귀 표시를 시각으로 기록하고 `BOARD_RETURN_TTL_MS`(30분)가 지나면 무시한다. 옛 형식 '1'도 무시한다
  - `parseDataTabParam`·`buildBoardHref`를 추가했다
- 테스트 +5: 저장·검증, TTL 만료, 옛 형식, 탭 파라미터, 주소 생성
- `TeamBoard.tsx`
  - 데이터 탭을 `?tab=archive`에서 파생한다. 전환은 push로 보기 방식과 맞췄다(D-F-Q1)
  - 탭 전환 재조회는 스켈레톤 대신 기존 뷰를 흐리게(`aria-busy`·`pointer-events-none`) 둔다
  - 보관·복원 버튼은 현재 표시 중인 목록의 탭(`tasksTab`)을 따른다
  - 캘린더 달·리스트 정렬을 복원하고 저장한다
- `TaskDetailPage.tsx`: 돌아가기 링크를 `buildBoardHref`(보기·탭 포함)로 만든다
- `CalendarView.tsx`: `initialMonth`·`onMonthChange` / `ListView.tsx`: `initialSort`·`onSortChange`
- 커밋 초안: `feat(teams): 보관함 탭 URL 유지, 탭 전환 시 뷰 유지, 캘린더 달·리스트 정렬 보존`

### S16 — 칸반 높이·캘린더 표시·라벨·터치 타깃 (V12·V13·V14·V21·Q12)
- `Kanban.tsx`
  - 첫 높이를 `useLayoutEffect`로 페인트 전에 잡는다
  - 가로 이동 중 높이는 지나가는 컬럼(스와이프는 양옆, 탭 이동은 구간) 중 최댓값으로 둔다
- 신규 `utils/calendarUtils.ts`(+test 2): 날짜별로 접힌 수(단일 초과분 + 밀려난 멀티데이 바). 예전에는 토요일 칸에만 나왔다
- `CalendarView.tsx`
  - "+N개"와 `aria-label`
  - 팝오버 아래 공간이 부족하면 위로 띄운다(`useLayoutEffect`)
- 라벨을 한국어로 바꿨다: 목록·타임라인·달력·"N개"
- 44px 터치 타깃: 데이터 탭·보기 버튼·캘린더 ◀▶/오늘·칸반 점(패딩)·리스트 복원
- 커밋 초안 3개: `fix(teams): 칸반 첫 높이·가로 이동 중 높이 출렁임 완화` / `fix(teams): 캘린더 날짜별 +N개 표시와 팝오버 위치` / `fix(teams): 보드 뷰 라벨 한국어화와 터치 타깃 44px`

### S17 — 채팅 탭 복귀 보정 간격 (G9)
- `teamChatUtils.ts`: `shouldResyncOnVisible`(+test 2)
- `TeamChatContext.tsx`: 마지막 보정 시작 시각을 기록하고, 탭 복귀 보정은 30초 간격을 둔다. 재입장 보정은 간격과 관계없이 그대로 돈다
- 커밋 초안: `perf(chat): 탭 복귀 resync 최소 간격 30초`

### S18 — 데드코드 삭제 (D-F-Q4)
- 삭제한 파일:
  - `hooks/useTeamData.ts`
  - `components/ErrorBoundary.tsx`
  - `hooks/useMediaQuery.ts`(useIsDesktop·useIsMobile 포함)
  - `teams/components/DateInfoCard.tsx`·`TaskStatusBadge.tsx`
  - `app/services/page.tsx`
  - 빈 `app/api/og`
- 부분 삭제:
  - `useMultipleAsyncOperations`
  - `LoadingSpinner`·`ButtonSpinner`
  - `formatShortDate`와 그 테스트·문서 표 행
  - barrel export 정리
- `.claude/rules/components.md`의 로딩 컴포넌트 표를 갱신했다
- **`getMonthDays`는 삭제하지 않았다**: `generateCalendarGrid`가 내부에서 쓴다. 감사 때 "외부 import 0건"을 사용처 0건으로 잘못 본 것이다
- 검증: lint·typecheck·test 통과, build(sandbox 밖) 통과. 라우트 목록에서 `/services`가 빠졌다
- 커밋 초안: `chore: 사용처 없는 훅·컴포넌트·유틸·placeholder 페이지 삭제`

### S19~S23 — `/time-measurement` (TM1~TM22, D-TM-Q1~Q7)
- 신규 `utils/timeRange.ts`(+test 10)
  - `normalizeTimeValue`(한 자리 시 정규화, 빈 값·형식 오류는 null)
  - `computeTimeRangeState`(invalid·before·running·done, 야간 구간과 자정 넘김)
  - `splitDuration`
- `page.tsx`
  - 초 경계에 맞춘 tick, `visibilitychange` 때 즉시 갱신, 마운트 전에는 자리 표시
  - 남은 시간 섹션을 항상 렌더하고 시작 전·완료 배지를 둔다
  - 통계 칸을 "경과 시간"으로 바꿨다
  - 시간 변경과 `?anim=`은 `replace`+`scroll:false`
  - 빈 값·형식 오류 입력은 무시한다
  - 진행바는 `scaleX`·`role="progressbar"`, 장식 애니메이션은 `aria-hidden`
  - 선택 그룹 라벨과 44px, `tabular-nums`, 상수는 모듈 스코프, 라벨을 한국어로(시간 측정·궤도·파도·링)
  - 스켈레톤을 실제 구성과 맞췄다
- 애니메이션 4종
  - 배터리: 숫자=남은 %, 라벨 "남음", clip-path, 색 단계는 opacity 교차
  - 궤도: 글로우를 `::after` opacity로
  - 링: filter 애니메이션을 제거하고 `::before` opacity로
  - 파도: 슬롯 `scaleY`와 막대 출렁임 분리, 폭 `100%/max 280px`
  - 4종 모두 `prefers-reduced-motion`과 `tabular-nums`, 라벨은 "경과"
- 검증: test:run 16 files/237 통과. **화면은 미검증**이다. 공개 페이지라 `bun run dev`로 바로 확인할 수 있다
- 커밋 초안 5개: `feat(time): 시간 범위 계산 분리(야간·시작 전·완료)` / `fix(time): 초 경계 tick·첫 페인트 점프·레이아웃 이동 제거` / `perf(time): 애니메이션 transform·opacity 전환, reduced-motion 대응` / `fix(time): 진행바·선택 그룹 접근성` / `feat(time): 시작 전·완료 상태, 설정 URL replace·애니메이션 유지, 한국어 라벨`

### S25 — coverage-v8 (D-F-Q6-approved)
- `bun add -d @vitest/coverage-v8@4.0.18`: `package.json`과 `bun.lockb`를 같은 커밋에 넣는다. vitest와 버전이 정확히 같아야 하므로(peer) 고정 버전으로 넣었다
- `bun run test:coverage`: 237 통과, 커버리지 리포트가 정상 출력된다. 산출물 `/coverage`는 gitignore 대상이다
- 커밋 초안: `chore(test): coverage-v8 추가로 test:coverage 복구`

### 구현 종료 시점 검증
- `bun run lint`: 에러 0, 경고 4(기준선과 같다. TeamBoard exhaustive-deps)
- `bun run typecheck`: 통과
- `bun run test:run`: 16 files / 237 tests 통과
- `bun run build`(sandbox 밖): S18 직후 통과. 이후 변경은 이어지는 리뷰 루프 마지막에 다시 확인한다

## 2026-10-15 — 리뷰 A·B 교차검증 루프 (2라운드에서 종료)

- 리뷰 A: 레포 전용 `/review-flow` → `review-front` 에이전트. 범용 `/review`는 "전용 리뷰 스킬이 있으면 그쪽을 우선한다"는 스킬 설명에 따라 A로 갈음했다
- 리뷰 B: 독립 Opus 서브에이전트. A의 결과는 주지 않았다

### 1라운드
| 구분 | A | B | 교차 판정 |
|---|---|---|---|
| 상 | 1 | 1 | **CONFIRMED**. 두 리뷰가 같은 지적을 독립적으로 했다. 첫 로딩 중 탭을 전환하면 스켈레톤·흐림이 영구히 남는다. 원인은 S2·S15가 같은 `loadingSeqRef`를 쓰면서 각자 다른 플래그를 끈 것이고, 내 회귀다 |
| 중 | 0(테스트 공백 #2를 중으로 분류) | 1 | **CONFIRMED**. 위 회귀를 잡을 테스트가 없었다 |
| 하 | 10 | 13 | CONFIRMED 후 수정 11건 · 후속 7건 · 의도 확인 1건 |
- 두 리뷰가 서로 다르게 본 항목은 없다. 판정이 엇갈린 것은 없고, 한쪽만 찾은 항목은 원본 코드로 직접 다시 확인했다. 그래서 반대편 리뷰어에게 되묻는 절차는 생략했다
- 수정 내용:
  - 신규 `hooks/useLatestFlag.ts`(+jsdom 테스트 3): 표시 플래그마다 순번을 따로 둔다. TeamBoard는 `trackInitialLoad`·`trackTabRefetch`로 바꿨다
  - TeamBoard
    - 저장 effect가 undefined인 달·정렬도 그대로 넘긴다(+테스트)
    - `taskCreated`는 `tasksTab` 기준으로 판정한다
    - 300ms 재조회는 `dataTabRef`로 조회한다
  - `useDialog`: 포커스가 대화상자 밖에 있을 때 Tab을 누르면 안으로 되돌린다(+테스트)
  - CalendarView
    - 팝오버를 열 때 포커스를 옮기고 닫을 때 트리거로 되돌린다(`role=dialog`)
    - 월 함수를 `calendarUtils`로 옮겼다(+테스트 2)
  - Kanban 점을 44px로 키웠다
  - Ring 글로우를 `closest-side` 75% 띠로 바꾸고 svg 아래에 둔다
  - workflow
    - ssh-action SHA 버전 주석을 같은 줄로 옮겼다(Dependabot이 읽는다)
    - `DEPLOY_STARTED`에 30초 여유를 뒀다
    - concurrency 주석을 실제 보장 범위대로 고쳤다

### 2라운드 (수정분과 이전 지적 해소 여부만)
- A: 상·중 미해결 **0건**. 새로 찾은 하 2건(N1 팝오버 focus 시 스크롤, N2 링 `.text` z-index)
- B: 상·중 미해결 **0건**. 새로 찾은 하 1건(N2와 같음)
- 반영: CalendarView `focus({ preventScroll: true })`, `.text { z-index: 2 }`
- 종료 조건(두 리뷰어 모두 상·중 0건)을 충족해 3라운드는 돌리지 않았다

### 최종 검증
- `bun run lint`: 에러 0, 경고 4(기준선과 같다)
- `bun run typecheck`: 통과
- `bun run test:run`: 17 files / 244 tests 통과(작업 전 5 files / 100)
- `bun run build`(sandbox 밖): 통과

### 후속 (범위 밖·결정 대기, 수정하지 않음)
- 결정 대기: 야간 구간 종료 후 '완료' 상태(bun-4a가 사용자에게 확인 중). 현재는 권장 기본값을 유지한다
- 사용자 결정 사항:
  - swarm `monitor 60s`와 healthcheck 판정 90s의 관계(백엔드 D-008과 맞춘 값)
  - PR `paths-ignore`와 필수 status check의 관계
- CI/Docker
  - ssh script의 `REGISTRY_URL` 직접 보간: 원래 있던 줄이고 자격증명이 아니다
  - Docker cache mount는 GHA에서 보존되지 않는다. 로컬·상주 빌더에서만 효과가 있고 해는 없다. 커밋 본문에 명시한다
- 접근성·UX
  - 중첩 모달이 생길 때 Esc 처리와 포커스 복원 대체 대상
  - time 입력 칸을 지우면 직전 값으로 되돌아간다
  - 연동 상태 첫 조회가 실패해도 자동으로 다시 조회하지 않는다(새로고침 버튼은 있다)
- S8·S10에서 범위 밖으로 뺀 것:
  - 낚시 모달 3종
  - TeamChatPanel 문서 레벨 Esc
  - 칸반 `inert`
  - `useAuthenticatedFetch` 취소
  - edit 페이지 팀 조회
  - `.env.build`의 `NEXT_PUBLIC_TEST`
- S11 테스트 중 발견: DST `Math.ceil`, Content-Type 중복, URLSearchParams body, HTML 오류 본문이 토스트에 그대로 노출
- 미검증:
  - 로그인이 필요한 화면 전부
  - `/time-measurement` 시각 확인(공개 페이지)
  - Docker 빌드와 `USER bun` 실행
  - 실제 배포 판정
  - iOS 실기기
  - 다음 main 배포 로그에서 `Update completed`, 4/4, healthcheck 통과를 확인한다

## 2026-10-15 — Playwright 실측 후속: 캘린더 팝오버 위치 (리뷰 3라운드)

- bun-4a 실측: /teams/1, MASTER 계정, 뷰포트 390·768·1280, 클릭·조회만. 49항목 중 47 통과, 실패 2건
- 실패 내용
  - FAIL1(중): 팝오버가 고정 하단 내비·FAB에 가려졌다. 데스크톱은 48px, 모바일은 26px 겹쳤다
  - FAIL2(하): 위로 띄운 팝오버가 헤더의 "다음 달" 버튼을 덮었다
  - INFO: 모바일에서 "+2개"가 두 줄로 꺾였다
- 원인: 위로 띄울지 판정할 때 `innerHeight`만 봤다. 고정 하단 요소와 달력 헤더는 경계로 보지 않았다
- 수정
  - `calendarUtils.ts`에 `choosePopoverPlacement`를 추가했다(+테스트 5). 아래를 먼저 보고, 안 들어가면 위로 띄운다. 둘 다 부족하면 넓은 쪽을 쓰고 maxHeight를 최소 96·최대 320 사이로 맞춘다. 방향을 넘기면 그 방향을 유지한다
  - `CalendarView.tsx`
    - 기존 flip effect를 `useLayoutEffect place()`로 바꿨다
    - 아래 경계 = 화면에 보이고 팝오버와 가로로 겹치는 `[data-fixed-bottom-overlay]`의 top − 8
    - 위 경계 = 달력 헤더 bottom + 8
    - 높이는 테두리를 포함해 계산한다
    - 스크롤·리사이즈 때 rAF로 높이와 위치만 다시 맞추고, 방향은 처음 열 때 정한 것을 유지한다
    - "+N개"에 `nowrap`을 줬다
  - `BottomNavBar` nav와 `FAB` Link·button에 `data-fixed-bottom-overlay` 속성을 붙였다(속성만 추가, 동작 변화 없음)
- FAB z-index는 올리지 않았다. 팝오버는 페이지 본문 stacking context(z-10) 안에 있어서 z-index를 올려도 FAB(z-50, fixed) 위로 올라갈 수 없다. 대신 FAB와 겹치지 않게 배치해서 해결했다
- 리뷰 3라운드(수정분 범위)
  - A: 상·중 0, 하 3
    - border 2px → 반영
    - 스크롤 중 뒤집힘 → 반영
    - 실시간 tasks 재배치 → 해당 없음(팝오버 tasks는 클릭 시점 스냅샷)
  - B: 상·중 0, 하 4
    - 스크롤 뒤집힘 → 반영
    - 최소 높이 때문에 겹침 허용 → 의도로 판단해 주석을 남겼다
    - tasks 변경 재배치 → 해당 없음
    - 상단 고정 헤더 → 후속
  - 판정이 엇갈린 항목 없음
- 검증: lint 에러 0 / 경고 4, typecheck 통과, test:run 17 / 249, build(sandbox 밖) 통과. 화면 재측정은 bun-4a가 같은 Playwright 스크립트로 한다
- 후속: 상단에 고정 요소가 생기면 위 경계에도 같은 속성 방식을 적용한다
- 커밋 초안(S16 캘린더 커밋에 합친다): `fix(teams): 캘린더 날짜별 +N개 표시와 팝오버를 보이는 영역(하단 내비·FAB·헤더) 안에 배치`

### 교훈 — dev 서버가 떠 있을 때 build 금지
- 증상: bun-4a가 같은 작업트리에서 dev 서버(localhost:3000)로 재측정하는 동안 내가 `bun run build`를 돌렸다. `.next`를 덮어써서 dev 서버가 `_buildManifest ENOENT` 500으로 깨졌다. bun-4a가 dev 서버를 재시작했다
- 규칙: build를 돌리기 전에 dev 서버가 떠 있는지 확인한다. 떠 있으면 띄운 쪽에 먼저 확인한다. 그 사이에는 lint·typecheck·test:run으로만 검증한다
- 이 교훈을 auto memory에 기록하려 했으나 권한 설정으로 막혀 여기에 남긴다

### 재측정 후속 — 위로 띄운 팝오버의 하단 경계 (리뷰 4라운드)
- 재측정: 4개 뷰포트 × 스크롤 위치 2곳. 실패는 1건 남았다
  - 증상: 앵커가 FAB·내비 높이이거나 그보다 아래일 때 위로 띄우면 아래 끝이 앵커 top에 붙어 겹쳤다
  - 데스크톱: 팝오버 563~797, FAB와 56px·내비와 48px 겹침
  - 모바일: 팝오버 548~742, FAB와 56px 겹침
- 수정: `choosePopoverPlacement`의 위쪽 배치 기준을 `aboveBottom = min(anchorTop − gap, bottomLimit)`로 바꿨다. 공간 계산과 top 모두 이 값을 쓴다. 재현값으로 테스트 1건을 추가했다
- 검증: lint 에러 0·경고 4, typecheck 통과, test 17 / 250. 같은 작업트리에서 bun-4a가 dev 서버를 띄워 측정 중이라 build는 미뤘다
- 리뷰
  - A: 상·중 0, 하 2
    - R1: 앵커와 팝오버 사이가 최대 약 49px 떨어진다. 겹침을 피하려면 감수할 비용이다
    - R2: below로 고정된 채 앵커가 내비 아래로 숨으면 최소 높이 때문에 겹친다
  - B: 상·중 0, 하 3
    - Q1 = R2
    - Q2: 경계값 테스트가 비어 있다
    - Q3: tasks가 바뀌어도 다시 배치하지 않는다. 팝오버 tasks는 열 때 찍어 둔 스냅샷이라 해당 없음
  - 판정이 엇갈린 항목은 없다
- 후속(조치하지 않음)
  - R2·Q1: 앵커 자체가 가려진 상황에서만 생긴다. 고친다면 앵커가 화면 밖으로 나갈 때 닫는 방식을 별도로 검토한다
  - Q2: 경계값 테스트 보강

## 2026-10-15 — 최종 확인
- bun-4a 재측정(Playwright, /teams/1, MASTER, 클릭·조회만): **전부 PASS**
  - 캘린더 팝오버: 뷰포트 4종 × 스크롤 위치 3종(start/end/FAB 근처 앵커)
    - 위로 띄울 때 bottom ≤ FAB top − 8 (데스크톱 652 / 660)
    - top은 헤더 아래
  - 회귀: ui 37/0, ui2 12/12, API 16/16
- dev 서버가 내려간 것(3000 LISTEN 없음)을 확인한 뒤 최종 검증
  - `bun run build`(sandbox 밖): 통과
  - `bun run lint`: 에러 0 / 경고 4 (기준선)
  - `bun run typecheck`: 통과
  - `bun run test:run`: 17 files / 250 tests
- 남은 미검증
  - Docker 빌드와 `USER bun` 실행
  - 실제 배포 판정: 다음 main 배포 로그에서 `Update completed`, 4/4, healthcheck를 본다
  - iOS 실기기
  - `/time-measurement` 시각 확인

## 2026-10-15 — 커밋·머지·운영 배포 (사용자 지시, bun-4a 경유)

- 커밋 30개 (feat-onam-audit, 베이스 b60ee60). 다른 세션 WIP(`src/lib/auth.ts`, `docs/handoff/`)는 제외했다
  - 여러 슬라이스가 같은 hunk를 공유하는 파일은 커밋 시점 버전을 만들어 `git update-index --cacheinfo`로 나눠 스테이징했다. 대상은 workflow·Dockerfile·hooks/index·teams/components/index·taskUtils(+test)
  - 보드 관련 파일 다수는 하나의 슬라이스가 같은 파일 여러 곳을 고쳐서 주제별 커밋으로 묶었다. 각 커밋이 단독으로 컴파일되는 순서로 배치했다
  - **30개 커밋 각각을 단독 worktree에서 tsc로 검사해 오류 0건**
  - tip 검증: lint 에러 0·경고 4, typecheck, test 17/250, build(sandbox 밖) 모두 통과
- PR #328 (feat-onam-audit → develop): verify 통과(17s), deploy는 PR이라 skip → merge `e31018e`
- PR #329 (develop → main): `origin/main..origin/develop`에는 이번 30개 + 머지 커밋만 있었다. verify 통과(21s) → merge `95e4eac`
- 운영 배포 run 38704433056(push, 95e4eac): **success**
  - verify 08:16:04→08:16:23
  - deploy 08:16:29→08:19:47. 이미지 빌드는 Dockerfile cache mount·`USER bun` 포함으로 성공했다
  - 판정 로그
    - `--detach=false` 경고(`Since --detach=false was not specified`) **0건**. 이전 배포에서는 이 경고가 찍혔다
    - `verify: Service … converged` → **`Update completed`**
    - `prod_next_app replicated 4/4 …/prod_next:95e4eac`
    - 수렴 시간은 약 87초(배포 단계 시작 08:18:05 → converged 08:19:32). rollback·`Deploy failed` 출력 없음
  - 결론: 새 배포 판정 스크립트, replicas 4, 비root 실행 이미지가 실제 배포에서 동작함을 확인했다
- 배포 직후 Dependabot이 PR #330~#334(develop 대상)를 열었다. 메이저 범프가 섞여 있어 사용자가 방침을 확인하는 중이다 — **머지·닫기 금지**
- 이 WORKLOG·STATUS 갱신은 아직 커밋하지 않았다(docs만 바뀐 변경이라 main에 들어가도 배포를 트리거하지 않는다)
