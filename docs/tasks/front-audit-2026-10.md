# 프론트 전수조사 (2026-10)

- 기준: `feat-onam-audit` = `origin/develop` b60ee60 (커밋 없음). 미커밋 WIP `src/lib/auth.ts`·`docs/handoff/`는 건드리지 않음 — `auth.ts`는 HEAD 버전 기준으로만 조사
- 방법: 정적 코드 분석(서브에이전트 3개) + 핵심 항목은 메인이 원본에서 재확인(✔ 표시). **로그인이 필요한 화면은 실제 동작 미검증**
- 코드 수정 없음

## 0. 검증 기준선 (develop 기준, 직접 실행)

| 명령 | 결과 |
|---|---|
| `bun run lint` | 에러 0 · 경고 4 (전부 `TeamBoard.tsx` exhaustive-deps: 524·737·835·852) |
| `bun run typecheck` | 통과 |
| `bun run test:run` | **10 files / 17 tests 실패** — 전부 `.claude/worktrees/chat-persistence/node_modules/tsconfig-paths/**` (로컬 worktree가 vitest 수집 대상에 들어감, §3 T1) |
| `vitest run --exclude '.claude/**'` | 5 files / 100 tests 전부 통과 |
| `bun run test:coverage` | 실패 — `@vitest/coverage-v8` 미설치 |

> 참고: 작업트리에 `node_modules`가 비어 있어 `bun install --frozen-lockfile`로 설치함(lockfile 변경 없음, 의존성 추가 없음).

---

## 1. 보기방식(뷰 모드) — 1순위

상태 흐름: `viewMode`는 URL `?view=`(kanban이면 파라미터 없음)에서 파생, 전환은 `router.push`. `dataTab`·필터·칸반 컬럼은 React state + sessionStorage(`teamBoardState:<id>`)에 저장하되 **상세에서 돌아온 진입(`teamBoardReturn` 1회용 플래그)일 때만 복원**. 스크롤은 150ms 디바운스 저장, 같은 view일 때만 복원. 캘린더 월·리스트 정렬은 컴포넌트 로컬 state라 왕복·탭 전환 시 소실. storage 접근은 전부 try/catch + effect 안이라 SSR/hydration 문제는 발견 못 함.

| # | 항목 | 파일:라인 | 근거 | 심각도 | 수정안 |
|---|---|---|---|---|---|
| V1 ✔ | 탭 전환·초기 조회 stale 응답 덮어쓰기 | `TeamBoard.tsx:184-189`, `:527-547` | `fetchAndSetTasks`가 응답을 무조건 `setTasks`. 활성↔보관함 연타 또는 초기 조회 중 전환 시 늦게 온 이전 탭 응답이 덮어씀. 한쪽 `finally`의 `setIsLoading(false)`가 다른 요청 진행 중 스켈레톤을 걷음 | 버그 | 요청 seq ref로 최신 요청만 `setTasks`/`setIsLoading(false)`. 또는 로딩 중 탭 토글 disabled |
| V2 ✔ | 보관함 탭에서 소켓 `taskCreated`가 활성 태스크를 목록에 추가 | `TeamBoard.tsx:223` | `if (payload.actStatus === 1)`만 보고 `dataTab`을 안 봄 | 버그 | `dataTabRef`로 현재 탭과 `actStatus` 비교, 같은 `taskId` 존재 시 skip |
| V3 ✔ | 캘린더 월 이동 시 팝오버가 이전 달 데이터로 남음 | `CalendarView.tsx:251-261` | `goToPrev/Next/Today`가 팝오버를 닫지 않음. Esc 닫기 없음 | 버그 | 세 함수에서 `setPopover(p => ({...p, isOpen:false}))` + Esc 핸들러 |
| V4 ✔ | 칸반 탭 클릭 시 300ms 플래그가 smooth scroll보다 먼저 풀림 | `Kanban.tsx:78-95` | 3컬럼 이상 이동 시 중간 scroll 이벤트가 `setActiveColumnIndex(중간값)` → 활성 탭 깜빡임, `onColumnChange`로 잘못된 값 저장 가능. 타이머 cleanup 없음. 실기기 재현 미검증 | 버그(추정) | `scrollend`(폴백: 목표 scrollLeft 도달 감지)로 해제 |
| V5 ✔ | 칸반 복원 컬럼이 1프레임 늦게 이동 (0번 컬럼 플래시) | `Kanban.tsx:66-71` | `useEffect`에서 `scrollLeft` 설정 | UX | `useLayoutEffect`로 교체(칸반은 로딩 후 마운트라 SSR 경고 없음) |
| V6 ✔ | 스켈레톤이 gantt·calendar에서도 칸반 모양 → 로딩 후 레이아웃 점프 | `TeamBoard.tsx:992-993` | `list`만 분기 | UX | 캘린더(7열 그리드)·간트 스켈레톤 추가 또는 min-h 고정 |
| V7 | 탭 전환 시 뷰 전체 언마운트 → 캘린더 월·리스트 정렬 초기화, 높이 감소로 스크롤 점프 | `TeamBoard.tsx:535`, `:992` | `setIsLoading(true)`가 뷰를 스켈레톤으로 교체 | UX | 탭 재조회는 `isRefetching`으로 분리해 기존 뷰 유지 + 얇은 로딩 표시 |
| V8 ✔ | 뷰 전환이 `router.push`라 히스토리 누적 | `TeamBoard.tsx:445` | 뷰 4번 바꾸면 뒤로가기 4번. 상세의 `router.back()` 복귀와도 얽힘 | UX | `router.replace(..., {scroll:false})` — **"뒤로가기=이전 뷰"가 의도였는지 결정 필요** |
| V9 | 캘린더 월·리스트 정렬이 상세 왕복 시 보존 안 됨 | `CalendarView.tsx:154`, `ListView.tsx:26-27` | 로컬 state. 스크롤·탭·필터·컬럼은 보존되는데 이 둘만 빠짐 | UX | `BoardState`에 `calendarMonth`·`listSort` 추가(검증 포함) |
| V10 | `teamBoardReturn` 플래그 잔존 → 나중 진입에서 오래된 필터·탭 복원 | `boardStateStorage.ts:114-129` | 보드→상세→(보드 안 거치고) 이탈 시 플래그가 남음 | UX(경미) | 플래그에 타임스탬프 저장, 예: 30분 초과 무시 |
| V11 | 새로고침·공유 링크에서 탭·필터 소실 | `TeamBoard.tsx:574` | 복원은 상세 복귀 때만(의도된 설계) | 개선 | 최소 `?tab=archive`만 URL화 검토 |
| V12 | 칸반 컨테이너 높이가 첫 렌더·스와이프 중 auto↔활성 높이로 출렁임 (CLS) | `Kanban.tsx:37-63`, `:162` | 컬럼 이동마다 하단 인디케이터·FAB 위치 점프 | UX | 전환 중에는 `max(prev,next)` min-height 유지 |
| V13 | 캘린더 "+n more"가 토요일 칸에만 붙음 | `CalendarView.tsx:369` | 멀티데이 바 3줄 이상인 주에서 다른 요일엔 숨김 표시 없음 | 버그(경미, 화면 확인 필요) | 날짜별 숨김 개수 합산 표시 |
| V14 | 캘린더 팝오버 세로 클램프 없음 + 조상 `overflow-hidden` | `CalendarView.tsx:197-198`, `styles/teams.ts:42` | 마지막 주에서 잘릴 가능성 (미검증) | UX(추정) | 하단 공간 부족 시 위로 띄움 |
| V15 | 캘린더 항목·멀티데이 바가 `div onClick` | `CalendarView.tsx:406-415, 435-453, 469-478, 516-525` | 키보드·스크린리더 불가. ◀▶에 `aria-label` 없음(:278-292) | UX | `<button>` 교체, `aria-label="이전 달"/"다음 달"` |
| V16 | ListView 정렬 헤더가 `th onClick`뿐 | `ListView.tsx:127-162` | 키보드 정렬 불가, `aria-sort` 없음 | UX | `th` 안 `<button>` + `aria-sort` |
| V17 | 터치 타깃 < 44px | `ViewModeToggle.tsx:37`(≈28px), `:58`(≈36px), `Kanban.tsx:224-229`(점 8px), `CalendarView.tsx:280,289`, `ListView.tsx:231` | 모바일 우선 앱 | UX | `min-h-[44px] min-w-[44px]`, 점은 패딩 래퍼 |
| V18 | 토글 그룹 시맨틱 부재, 칸반 탭에 tablist 없음, 화면 밖 컬럼이 Tab 순서에 포함 | `ViewModeToggle.tsx:31,50`, `Kanban.tsx:121-155,165-214` | 포커스가 화면 밖 카드로 가면 가로 스크롤이 튐 | UX | `role="group" aria-label`, 비활성 컬럼 `inert` 검토 |
| V19 | `ViewMode` 타입·허용값 3중 정의 | `ViewModeToggle.tsx:5`, `boardStateStorage.ts:9,31`, `TeamBoard.tsx:59` | 뷰 추가 시 누락 위험 | 개선 | `boardStateStorage`의 `VIEW_MODES`를 SSOT로 |
| V20 ✔ | 세 뷰 컨테이너에 `backdrop-blur-xl` (CLAUDE.md Never) | `styles/teams.ts:56` (List·Calendar·Gantt 사용), `StatusDropdown.tsx:170` | iOS Safari 성능 | 개선(규약 위반) | 블러 제거, `bg-slate-900/80` 등 반투명 배경 |
| V21 | 영문 라벨 혼재 | `ListView.tsx:120`, `CalendarView.tsx:274`, `GanttChart.tsx:107`, `Kanban.tsx:190` | 한국어 UI 규약 | 개선 | 의도(eyebrow 라벨)인지 확인 후 한국어화 |
| V22 | 기타 경미 | `ListView.tsx:84`(SortIcon 내부 정의), `:163/:224`(복원 컬럼 조건 불일치), `Kanban.tsx:49-63,97-116`(scroll 리스너 2개·resize 미대응), `TeamBoard.tsx:612-615`(키 입력마다 storage write), `globals.css:86-95`(미사용 `.mobile-kanban-*`) | — | 개선 | 각각 정리 |

---

## 2. 프로젝트 전반

| # | 항목 | 파일:라인 | 근거 | 심각도 | 수정안 |
|---|---|---|---|---|---|
| G1 ✔ | 인증 없는 `/api/test`가 서버 env(`TEST`·`TEST2`) 값을 응답하고 서버 로그에도 출력 | `src/app/api/test/route.ts:1-30` | 미들웨어 없음 | **보안(높음)** | 라우트 삭제(삭제 승인 필요) 또는 production에서 404. 운영 노출·값 민감성 확인 필요 |
| G2 ✔ | 백엔드 accessToken을 JS로 `access_token` 쿠키에 기록(HttpOnly 불가) | `SessionProvider.tsx:16-36` | **백엔드 `JwtAuthGuard`가 cookie를 Bearer보다 우선 사용**(`../bun/src/common/guards/jwt-auth.guard.ts:50-53`) → 실사용 인증 경로. XSS 시 탈취 가능 | 보안(중) | 단순 삭제 불가. HttpOnly 발급(백엔드 Set-Cookie 또는 Next route handler)로 전환 — **백엔드 계약 영향, 별건 설계 필요** |
| G3 ✔ | 401 경로의 쿠키 삭제에 `Domain`·`Secure` 누락 → `NEXT_PUBLIC_COOKIE_DOMAIN` 설정 시 안 지워짐. `signOut()` 직후 리다이렉트로 정리 effect 미실행 가능 | `SessionProvider.tsx:42`, `mypage/page.tsx:157` | 같은 이름·다른 Domain 쿠키는 별개 | 보안(중, 브라우저 확인 필요) | 설정과 동일 속성으로 지우는 `clearAccessTokenCookie()` 헬퍼를 signOut 전에 호출 |
| G4 | 동시 401 N건이면 `signOut` N번 | `FetchService.ts:114-118`, `SessionProvider.tsx:40-49` | — | 개선 | `isSigningOut` 1회 가드 |
| G5 | 소켓 재연결 후 보드·상세가 refetch 안 함 → 끊긴 동안의 task 이벤트 유실 | `TeamBoard.tsx`, `TaskDetailPage.tsx` (`roomJoinCount` 참조 0건) | 채팅만 보정 | 버그/UX | `roomJoinCount > 1`이면 1회 refetch |
| G6 | `reconnect()`의 `setTimeout(initializeSocket,100)` 언마운트 시 미취소 | `TeamSocketContext.tsx:311`, `FishingSocketContext.tsx:331` | 소켓 누수 가능 | 버그(낮음) | ref 저장 후 cleanup에서 clear |
| G7 | 소켓 `commentCreated`·`taskCreated` 중복 방지 없음 | `TaskDetailPage.tsx` handleSocketCommentCreated, `TeamBoard.tsx:199~` | refetch와 겹치면 key 중복 | 버그(낮음) | id 존재 시 skip |
| G8 | `invite/accept` effect가 StrictMode dev에서 `acceptTeamInvite` 이중 호출 가능, 1500ms 타이머 미정리 | `teams/invite/accept/page.tsx:37, 54-76` | state 가드라 같은 클로저 재진입 | 버그(dev, 미검증) | `startedRef` 가드 |
| G9 | 채팅 resync가 탭 복귀마다 API 2개 + 메시지 교체, `messages` 상한·가상화 없음 | `TeamChatContext.tsx` visibility effect(≈505-520), `TeamChatPanel.tsx` ≈225-233 | 장기 세션 성능 | UX/성능 | 최소 간격(30s) 도입, 항목 `memo` |
| G10 | 팀 진입 시 보드에 불필요한 통합 상태·초대 조회까지 선호출 | `TeamBoard.tsx:468~` | 설정 탭 미진입이어도 호출 | 성능 | 탭 최초 진입 시 lazy |
| G11 | 멤버·통합 조회 실패를 console만 처리 | `TeamBoard.tsx` ≈481-495, `useTeamInvite.ts` fetchInvites | 역할 UI가 추정값으로 폴백, 사용자 알림 없음 | UX | 비-403 실패 시 toast |
| G12 | 모달 접근성: `ConfirmModal`·`InviteModal`·`RoleChangeModal`에 dialog 속성·ESC·포커스 처리 없음. `TeamChatPanel`·`ChatReadersModal`·`OnlineUsers` ESC 불완전 | `ConfirmModal.tsx:31~` 등 | grep 0건 | UX | 공용 모달 훅(ESC·초기 포커스·trap·복원) 1개로 7곳 적용 |
| G13 | label 미연결 input | `InviteModal.tsx:112,129`, `TaskFilters.tsx:84,146`, `DiscordSection.tsx:136`, `mypage/page.tsx:98`, `TaskDetailPage.tsx:682,713`, `ChatPanel.tsx:229` | — | UX | `aria-label` 또는 `htmlFor`/`id` |
| G14 | 데드코드 약 600줄 | `hooks/useTeamData.ts`(326, barrel 외 0건), `components/ErrorBoundary.tsx`(159), `useMediaQuery`, `useMultipleAsyncOperations`, `LoadingSpinner`·`ButtonSpinner`·`DateInfoCard`·`TaskStatusBadge`, `getMonthDays`, `formatShortDate`, `src/app/services/page.tsx`(placeholder 공개 라우트), 빈 `src/app/api/og` | grep import 0건 | 개선 | 삭제(승인 필요). `LoadingSpinner`는 `.claude/rules/components.md`도 함께 수정 |
| G15 | JSON-LD `dangerouslySetInnerHTML`에 `<` 이스케이프 없음 | 8곳(`page.tsx:31`, `fishing/guide/[fishId]/page.tsx:87,91` 등) | 현재 정적 값으로 보이나 `[fishId]` 입력 출처 미확인 | 보안(낮음) | `JSON.stringify(x).replace(/</g,'\\u003c')` |
| G16 | 기타 | `TaskDetailPage.tsx:378`(성공메시지 타이머 미정리), `handleDeleteComment` 죽은 catch, `useSafeNavigation.ts:77~` 함수 비메모, `useAuthenticatedFetch.ts:41-75` 취소 없음, `edit/page.tsx:39` 팀 정보용 전체 태스크 조회 | — | 개선 | 각각 정리 |

양호: 타입 억제 `any`/`@ts-ignore` 0건, `eslint-disable` 3건(모두 사유 주석), 소켓 on/off 짝 일치, 토큰 localStorage 저장·로그 출력 없음, open redirect 없음.

---

## 3. 테스트 작성 가능성

**현황**: vitest 4 · environment `node` · jsdom·`@testing-library/react`·`jest-dom`·`@testing-library/dom` 설치됨. 테스트 5파일 100케이스(전부 `src/app/utils/`: taskUtils 36, teamChatUtils 41, chatOutbox 8, boardStateStorage 8, dateUtils 7). services·hooks·컴포넌트 커버리지 0.

| # | 항목 | 파일:라인 | 근거 | 심각도 | 수정안 |
|---|---|---|---|---|---|
| T1 ✔ | `.claude/worktrees/**`(내부 node_modules 포함)가 수집됨 → 로컬 `test:run` 17건 실패 | `vitest.config.mts:12` | exclude가 `node_modules`·`.next`뿐 | 버그(로컬 판정 오염) | exclude에 `'.claude/**'`, `'**/node_modules/**'` 추가 |
| T2 ✔ | `src/test/setup.ts`(jest-dom) 미연결 | `vitest.config.mts:8-13` | `setupFiles` 없음 → 컴포넌트 테스트 시 matcher 없음 | 중 | `setupFiles: ['./src/test/setup.ts']`, 컴포넌트·훅 파일은 `// @vitest-environment jsdom` |
| T3 ✔ | `test:coverage` 스크립트 실행 불가 | `package.json` | `@vitest/coverage-v8` 미설치 | 낮 | 의존성 추가(승인 필요) 또는 스크립트 제거 |
| T4 | 모킹 지점이 유리함 | `FetchService.ts:112`(fetch 호출 1곳), `:328`(FetchClient 클래스 export) | services 전체가 `backendFetch` 경유 → msw 없이 `vi.mock`으로 충분 | 정보 | — |
| T5 | 장애물 | `next/navigation` 의존 14파일, `useSession` 의존 훅, 소켓 `io()`가 컨텍스트 내부 호출(`TeamSocketContext.tsx:110`) | — | 중 | `src/test/`에 next/navigation·next-auth 공용 mock 헬퍼 |

**우선 작성 대상 (새 의존성 없이 약 10h)**

| 순서 | 대상 | 가치 | 난이도 | 공수 |
|---|---|---|---|---|
| 0 | T1·T2 설정 수정 | 선행 | 낮 | 0.25h |
| 1 | `FetchClient` (URL·쿼리·Bearer·throwOnError·401 이벤트) | 높음(모든 API 경유) | 낮 | 2h |
| 2 | `dateUtils` 미커버 함수 (calendar grid·buildTaskDatetime·parseTaskDatetime 등, UTC/로컬) | 높음 | 낮 | 2h |
| 3 | `taskUtils` 잔여, `errorUtils` | 중 | 낮 | 1.25h |
| 4 | `taskStatusConfig`(STATUS↔COLUMN 왕복)·`roleConfig` 폴백 | 중(상태 추가 회귀 방지) | 낮 | 1-1.5h |
| 5 | `teamService.handleApiError` + 대표 함수 5개 | 높음 | 중 | 3-4h |
| 6 | 훅: `useTaskFilter`, `useAsyncOperation`, `useAuthenticatedFetch` | 중 | 중 | 4h |
| 7 | 뷰 모드 회귀: `boardStateStorage`에 V9·V10 추가분 | 중 | 낮 | 1h |
| 8 | 컴포넌트(TaskCard·StatusDropdown·ConfirmModal), 소켓 컨텍스트 | 중 | 높음 | 각 1-4h, user-event 필요 |

**의존성 제안(승인 필요, 미추가)**: `@testing-library/user-event`(컴포넌트 상호작용 시작 시), `@vitest/coverage-v8`(coverage 필요 시). `msw`·`@vitejs/plugin-react`는 현재 불필요.

---

## 4. CI/CD (`.github/workflows/oci_build_and_deploy_next.yml`, `Dockerfile`, `infra/docker-stack.app.yml`)

이미 양호: `verify`(lint·typecheck·test) → `needs: verify` → `deploy`, arm64 네이티브 러너(QEMU 없음), buildx `type=gha mode=max` 캐시, sha 태그(latest 미사용), `environment: prod`, `--password-stdin`, swarm `start-first` + `failure_action: rollback`, 최종 이미지에 빌드 env 미포함.

| # | 항목 | 파일:라인 | 근거 | 심각도 | 수정안 |
|---|---|---|---|---|---|
| C1 ✔ | `workflow_dispatch`로 임의 브랜치 prod 배포 가능 | workflow:10, :51 | deploy에 ref 조건 없음. `prod` environment의 브랜치 제한 여부는 레포 설정이라 미확인 | 높 | deploy job `if: github.ref == 'refs/heads/main'` |
| C2 ✔ | concurrency 없음 | workflow 전체 | 연속 push 시 늦게 끝난 구 sha가 덮어쓸 수 있음 | 높 | `concurrency: {group: deploy-prod-next, cancel-in-progress: false}` |
| C3 ✔ | 배포 성공 판정이 `docker service ls` Replicas만 확인 | workflow:109, :120 | 롤링 중·롤백 후에도 성공 처리 가능 | 높 | `docker service inspect --format '{{.UpdateStatus.State}}'`가 `completed`일 때만 성공, rollback/paused면 exit 1 |
| C4 | 배포 후 외부 헬스체크 없음 | workflow:88-129 | 컨테이너 내부 healthcheck만 | 중 | `curl -fsS <도메인>/api/health` 재시도 |
| C5 ✔ | 서드파티 액션 mutable 태그 | workflow:89 `appleboy/ssh-action@v1.0.0` (SSH 키 전달) 외 :19·23·28·55·61·68 | — | 중 | ssh-action은 커밋 SHA 고정, 나머지는 Dependabot |
| C6 ✔ | `permissions` 미지정 | workflow 최상위 | — | 중 | `permissions: { contents: read }` |
| C7 ✔ | `StrictHostKeyChecking=no` | workflow:83 | MITM 가능 | 중 | known_hosts를 secret/var로 두고 검증 |
| C8 | 시크릿을 `${{ }}`로 run 스크립트에 직접 보간 | workflow:58, :96 | 쉘 인젝션 표면 | 낮 | `env:`로 전달 |
| C9 ✔ | `.dockerignore`가 `/node_modules`·`.env`뿐 | `.dockerignore` | `.git`·`.next`·`.claude`(worktrees)·`docs`가 빌드 컨텍스트로 전송, `COPY . .` 캐시 불안정 | 중 | `.git .next .claude docs .github **/node_modules *.tsbuildinfo` 추가 |
| C10 | Next 빌드 캐시·bun 캐시 미사용 | `Dockerfile:5`, `:13`, workflow:37 | 매번 콜드 빌드 | 중(속도) | `RUN --mount=type=cache,target=/app/.next/cache bun run build`, bun install cache mount, verify에 `actions/cache` |
| C11 ✔ | 런타임 root 실행 | `Dockerfile` production 스테이지(USER 없음) | — | 중 | `USER bun` + `COPY --chown=bun:bun` |
| C12 ✔ | swarm `monitor: 10s` < healthcheck(start_period 60s) | `infra/docker-stack.app.yml:35` | 실패 감지 전 안정 판정 가능(swarm 동작 확인 필요) | 중 | 60-90s 상향 검토(10 replicas × parallelism 1이라 배포 시간 증가 → parallelism 2 병행) |
| C13 | PR 트리거 없음 → PR에서 검증 미실행 | workflow `on:` | — | 중 | `on: pull_request`로 verify만 실행 |
| C14 | 수동 롤백 경로 없음 | workflow | sha 재빌드만 가능 | 낮 | dispatch 입력 `image_tag`로 빌드 생략 배포 |
| C15 ✔ | 락파일 혼재 | 루트 `pnpm-lock.yaml` + `bun.lockb` | CI·Docker는 bun.lockb만 사용 | 낮 | 용도 확인 후 정리(삭제 승인 필요) |
| C16 | `paths-ignore`에 `.claude/**` 없음 | workflow:7-9 | 설정만 바꿔도 prod 배포 | 낮 | `.claude/**` 추가 |

---

## 우선순위 Top 10

| 순위 | ID | 항목 | 이유 | 변경 크기 |
|---|---|---|---|---|
| 1 | G1 | `/api/test` env 노출 라우트 | 인증 없이 서버 env 응답, 최소 변경 최대 효과 | 파일 1개 삭제 |
| 2 | C1·C2 | 비-main 수동 배포 차단 + deploy concurrency | 잘못된/구버전 prod 배포 방지 | workflow 몇 줄 |
| 3 | C3 | 배포 성공 판정을 UpdateStatus로 | 롤백이 나도 CI가 성공으로 보고 | workflow 1단계 |
| 4 | V1·V2 | 보드 stale 응답 + 보관함 탭 오삽입 | 데이터 정합성 버그 | TeamBoard 소규모 |
| 5 | G3 (+G2 별건) | 로그아웃 시 쿠키 삭제 속성 불일치 | 로그아웃 후 토큰 쿠키 잔존 가능. HttpOnly 전환은 백엔드 협의 별건 | 헬퍼 1개 |
| 6 | T1·T2 | vitest exclude·setupFiles | 로컬 test:run이 지금 17건 실패로 판정 오염, 테스트 확장 선행조건 | config 2줄 |
| 7 | V3·V5 | 캘린더 팝오버 닫기, 칸반 복원 플래시 | 명백·저위험 | 각 3~5줄 |
| 8 | G5 | 소켓 재연결 시 보드·상세 refetch | 끊김 동안 이벤트 유실 | 소규모 |
| 9 | V20 | `backdrop-blur` 제거 (3개 뷰 + 드롭다운) | 레포 Never 규칙 위반, iOS 성능 | 2줄 |
| 10 | G12·V15~V18 | 모달·뷰 접근성/터치 타깃 | 모바일 우선 앱 UX | 공용 훅 + className |

## 결정 필요 (사용자)

1. V8: 뷰 전환 시 뒤로가기로 이전 뷰로 가는 동작이 의도인가? (replace로 바꿀지)
2. G1: `/api/test` 삭제 vs production 차단
3. G2: `access_token` 쿠키를 HttpOnly로 바꾸는 설계를 백엔드와 별건으로 진행할지
4. G14·C15: 데드코드·`pnpm-lock.yaml` 삭제 승인
5. T3·테스트 확장: `@vitest/coverage-v8`·`@testing-library/user-event` 추가 승인
6. C1: GitHub `prod` environment에 브랜치 제한이 이미 있는지 (레포 설정 확인)
