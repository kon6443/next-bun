# 프론트 전수조사 후속 수정

- **상태**: 🟢 완료 — main 머지·운영 배포 성공 (run 38704433056, `Update completed`, 4/4)
- **브랜치**: `feat-onam-audit` (`origin/develop` b60ee60 기반) · **최종수정**: 2026-10-15
- **근거 문서**: [감사 보고서](../front-audit-2026-10.md) — 항목 ID(V·G·T·C)는 이 보고서의 ID다. 이 폴더에서는 보고서 내용을 반복하지 않는다
- **관련**: [DECISIONS.md](DECISIONS.md) · [WORKLOG.md](WORKLOG.md) · 백엔드 짝 작업은 `../bun` 같은 이름 브랜치

## 목표 & 수용 기준
- 무엇을: 감사 보고서 항목 중 기획 의도를 바꾸지 않는 결함·규약 위반·접근성·CI 안전성을 고친다. 의도나 UX가 바뀔 수 있는 항목은 사용자 확인 뒤에 진행한다.
- 끝났다는 기준:
  - 아래 (A) 슬라이스가 전부 머지 가능한 상태다.
  - 각 슬라이스는 `bun run lint` 에러 0, 경고는 기준선 4 이하, `bun run typecheck` 통과, `bun run test:run` 통과(T1 이후 worktree 오염 없음)를 만족한다.
  - 순수 로직을 바꾼 슬라이스에는 회귀 테스트가 있다.
  - 로그인이 필요한 화면은 "미검증"으로 명시한다.
- 비목표:
  - 승인된 S13·S14·S18·S25 외의 의존성 추가·파일 삭제, 그리고 백엔드 계약 변경. 승인 전에는 하지 않는다.
  - 커밋·push. 사용자 지시가 있어야 한다.

## 실행계획

분류: **(A)** 의도 변경 없는 개발 수정 · **(B)** 의도·UX가 바뀔 수 있음, 사용자 확인 필요 · **(C)** 의존성·파일 삭제·외부 설정, 승인 필요

공통 검증: 슬라이스마다 `bun run lint && bun run typecheck && bun run test:run`을 돌린다. 영향이 큰 슬라이스(S9·S10)는 sandbox 밖에서 `bun run build`도 돌린다.
공통 롤백: 슬라이스 1개 = 커밋 1개라서 `git revert <sha>`로 되돌린다. 커밋 메시지는 레포 관례인 `type(scope): 한국어`를 따른다.

### (A) 바로 진행 가능 — 순서대로

| 슬라이스 | 항목 | 범위 | 수정 방식 | 검증·추가 테스트 | 커밋 |
|---|---|---|---|---|---|
| S1 | T1·T2 | `vitest.config.mts` | exclude에 `.claude/**`·`**/node_modules/**` 추가, `setupFiles: ['./src/test/setup.ts']` 추가. 기본 환경은 `node`로 유지 | `test:run`이 5 files/100 tests만 수집하는지 확인 | `chore(test): vitest 수집 범위에서 worktree 제외, jest-dom setup 연결` |
| S2 | V1 | `TeamBoard.tsx` 태스크 조회 | `fetchAndSetTasks`에 요청 seq ref를 둔다. 최신 요청만 `setTasks`·`setIsLoading(false)`를 실행하고, effect cleanup에서 seq를 무효화한다 | seq 판정을 순수 함수로 뺄 수 있으면 단위 테스트. 화면은 미검증(로그인 필요) | `fix(teams): 탭 전환 시 늦게 온 태스크 응답이 최신 목록을 덮어쓰지 않게` |
| S3 | V2·G7 | `TeamBoard.tsx` 소켓 `taskCreated`, `TaskDetailPage.tsx` `commentCreated` | `dataTabRef`로 현재 탭과 `actStatus`를 비교한다. 같은 id가 이미 있으면 무시한다 | "추가할지" 판정을 `taskUtils`에 순수 함수로 두고 테스트(탭 2종 × actStatus 2종 × 중복) | `fix(teams): 보관함 탭 소켓 태스크 오삽입과 중복 추가 방지` |
| S4 | V3·V5·V4 | `CalendarView.tsx`, `Kanban.tsx` | 월 이동·오늘 버튼에서 팝오버를 닫고 Esc로도 닫히게 한다. 칸반 복원은 `useLayoutEffect`로 바꾼다. 탭 이동 플래그는 `scrollend`로 해제하고, 이벤트를 지원하지 않으면 목표 위치 도달 감지로 대신하며 타이머는 cleanup한다 | lint·typecheck. 실기기(iOS Safari) 확인 필요 → 미검증 표기 | 2커밋: 캘린더 / 칸반 |
| S5 | G4만 (쿠키 관련 부분은 D-F-Q3 보류) | `SessionProvider.tsx` | `backend:unauthorized`를 1회만 처리하도록 막는다. 쿠키 기록·삭제 코드는 손대지 않는다 | lint·typecheck·test:run | `fix(auth): 401 동시 다발 시 signOut 1회만` |
| S6 | G5·G6 | `TeamBoard.tsx`, `TaskDetailPage.tsx`, `TeamSocketContext.tsx`, `FishingSocketContext.tsx` | 재입장 시(`roomJoinCount > 1`) 태스크 목록과 상세를 1회 다시 조회한다. `reconnect()`의 타이머를 ref에 저장하고 cleanup에서 해제한다 | lint·typecheck. 재연결 시나리오는 미검증 | `fix(teams): 소켓 재연결 후 보드·상세 재조회, 재연결 타이머 정리` |
| S7 | (c) 연동 상태 | `TeamBoard.tsx`, `teamService.ts` 타입 | 연동 상태 조회를 초기 `Promise.all`에서 빼고 관리 탭(telegram/discord)을 처음 열 때만 조회한다. 그러면 비관리자는 아예 조회하지 않는다. 응답 타입은 `chatId?`·`webhookUrl?`·`pendingLink?`를 optional로 바꾼다 | typecheck(optional로 바꾼 뒤 사용처 컴파일 확인). 관리자 화면은 미검증 | `refactor(teams): 연동 상태는 관리 탭 진입 시 관리자만 조회` |
| S8 | V6·V19·V22·G15·G16·G8 | 스켈레톤, 뷰 타입 SSOT, 경미 정리, JSON-LD 이스케이프, 타이머 정리, 초대 수락 `startedRef` | 감사 보고서의 수정안대로 | JSON-LD 직렬화 헬퍼 테스트(`</script>` 입력) | 주제별 3~4커밋 |
| S9 | V20 | `styles/teams.ts:56`, `StatusDropdown.tsx:170` | `backdrop-blur` 제거, 반투명 배경으로 대체 (CLAUDE.md Never 준수) | 시각 비교는 사용자가 확인. sandbox 밖에서 build | `style(teams): backdrop-blur를 반투명 배경으로 교체` |
| S10 | 접근성(시맨틱만) | `ViewModeToggle`, `CalendarView`, `ListView`, `Kanban`, 모달 7곳, label 미연결 input | `role="group"`·`aria-label`·`aria-sort`·`aria-pressed`를 단다. `div onClick`은 `button`으로 바꾼다. 공용 `useDialog` 훅(ESC·초기 포커스·포커스 복원·trap)을 만든다. 크기·레이아웃은 바꾸지 않는다 | 훅은 jsdom 환경에서 `@testing-library/react`로 테스트. user-event 없이 `fireEvent`로 충분 | 훅 1 + 적용 2~3커밋 |
| S11 | 테스트 확충 (의존성 없이) | `FetchService`, `dateUtils`·`taskUtils` 잔여, `taskStatusConfig`·`roleConfig`, `errorUtils`, `handleApiError` | 감사 보고서 §3 순서대로 | 새 테스트 자체가 검증이다 | `test(...)` 대상별 커밋 |
| S12 | CI 안전성 | workflow, `Dockerfile`, `.dockerignore` | **우선 커밋**: 스크립트를 `set -euo pipefail`로 시작한다. `docker stack deploy --detach=false`(workflow:99)를 넣고 Replicas 폴링을 제거한다. `UpdateStatus.State`가 `completed`일 때만 성공이다. 그 외 상태이거나 전체 대기 15분을 넘기면 `docker service ps`를 출력하고 `exit 1`한다(D-S12-detach·D-S12-script). 이어서 C2 concurrency, C6 `permissions: contents: read`, C8 시크릿을 `env:`로 전달, C9 `.dockerignore`, C10 cache mount, C13 `pull_request` 트리거로 verify만, C16 `.claude/**` paths-ignore, C5 ssh-action SHA 고정 + Dependabot. C11 `USER bun`은 별도 커밋. **제외(보류)**: C1·C14·C4. C12는 S24 | `actionlint`가 있으면 돌린다. 실제 확인은 다음 배포 로그에서 `--detach=false` 경고가 사라지고 실제 수렴 시간이 찍히는지 본다. C11은 swarm 자동 롤백에 기댄다 | `fix(ci): stack deploy 완료를 기다리고 UpdateStatus로 성공 판정` 1 + `chore(ci): ...` 2~3 + `chore(docker): 비root 실행` 1 |
| S13 | G1 (D-F-Q2) | `src/app/api/test/route.ts` 삭제 | 파일을 삭제한다(승인됨) | grep 참조 0건 재확인, lint·typecheck, sandbox 밖에서 build | `chore(api): CI env 테스트용 /api/test 라우트 삭제` |
| S14 | C15 (D-F-Q5) | `pnpm-lock.yaml` 삭제 | 파일을 삭제한다(승인됨) | `bun install --frozen-lockfile` 통과 | `chore: 사용하지 않는 pnpm-lock.yaml 삭제` |
| S15 | V7·V9·V10·V11 (D-UX) | `TeamBoard.tsx`, `boardStateStorage.ts`, `CalendarView.tsx`, `ListView.tsx` | 탭 전환 재조회는 `isRefetching`으로 처리해 뷰를 유지한다. `BoardState`에 `calendarMonth`·`listSort`(검증 포함)를 추가한다. 복귀 플래그에 타임스탬프를 넣어 30분이 지나면 무시한다. `?tab=archive`를 URL로 둔다(`view`와 같은 방식, push 유지 — D-F-Q1) | `boardStateStorage.test.ts`에 필드 검증·만료 케이스 추가. 화면은 미검증 | 3~4커밋 |
| S16 | V12·V13·V14·V21·Q12 (D-UX) | `Kanban.tsx`, `CalendarView.tsx`, 뷰 라벨, 터치 타깃 | 칸반은 전환 중 min-height를 유지한다. 캘린더 +n more는 날짜별 숨김 개수로 계산한다(순수 함수로 빼서 테스트). 하단 공간이 부족하면 팝오버를 위로 띄운다. 라벨을 한국어로 바꾼다. 터치 타깃을 44px로 맞춘다 | 숨김 개수 계산 단위 테스트. 시각 확인은 사용자 | 4커밋 |
| S17 | G9 (D-UX) | `TeamChatContext.tsx` | visibility 복귀 시 resync에 최소 간격 30초를 둔다(마지막 성공 시각 ref) | 간격 판정을 순수 함수로 빼서 테스트 | `perf(chat): 탭 복귀 resync 최소 간격 30초` |

| S18 | G14 (D-F-Q4) | `hooks/useTeamData.ts`, `components/ErrorBoundary.tsx`, `useMediaQuery`, `useMultipleAsyncOperations`, `LoadingSpinner`·`ButtonSpinner`·`DateInfoCard`·`TaskStatusBadge`, `getMonthDays`, `formatShortDate`, `src/app/services/page.tsx`, 빈 `src/app/api/og`, barrel export, `.claude/rules/components.md` | 삭제 직전에 각 심볼을 다시 grep해 import 0건을 확인한 뒤 지운다. `getMonthDays`·`formatShortDate`의 테스트도 함께 정리한다 | lint·typecheck·test:run, sandbox 밖에서 build | `chore: 사용처 없는 훅·컴포넌트·유틸 삭제` (1커밋) |
| S19~S22 | `/time-measurement` (A) | `src/app/time-measurement/**`, 새 `utils/timeRange.ts` | [WORKLOG 3차](WORKLOG.md) 슬라이스 제안대로 진행한다. 계산 분리·가드 → 첫 페인트·tick → 애니메이션 성능·reduced-motion → 접근성 | S19는 단위 테스트. 화면은 사용자가 `bun run dev`로 확인한다(미검증) | 4커밋 |
| S23 | `/time-measurement` (B, D-TM-Q1~Q8 확정) | 같은 범위 | **TM14**: 야간 해석과 시작=종료 안내. S19의 `timeRange` 함수에 포함한다. **TM4**: 배터리 숫자를 남은 %로, 라벨을 "남음"으로. **TM12**: `replace`+`scroll:false`. **TM13**: `?anim=`. **TM15·16**: 시작 전·완료 상태, 섹션 유지. **TM17**: 진행률 중복 칸을 "경과 시간"으로. **TM18**: 라벨 한국어화. TM23(탭 제목)은 제외 | `timeRange` 단위 테스트(야간, 시작 전·진행·완료 경계, 시작=종료). 화면은 사용자 확인 | 3커밋: 계산·상태(TM14·15·16) / URL(TM12·13) / 표시(TM4·17·18) |
| S24 | D-INFRA-replicas·D-INFRA-swarm | `infra/docker-stack.app.yml` | `replicas: 10→4`, `update_config.monitor: 10s→60s`로 바꾼다. `parallelism: 1`·`start-first`·`rollback`은 유지한다. `restart_policy`에 `delay: 10s`를 추가한다. 재시작 횟수 상한은 두지 않는다(D-INFRA-restart). 헬스체크는 이미 스택에만 있어 그대로 둔다 | YAML 문법 확인. 실제 확인은 S12 적용 후 배포 로그에서 `UpdateStatus completed`, 레플리카 4/4, 수렴 시간을 본다 | `chore(infra): 프론트 레플리카 4로 축소, swarm 업데이트 monitor 60s·재시작 간격` (revert로 롤백) |
| S25 | D-F-Q6-approved | `package.json`, `bun.lockb` | `bun add -d @vitest/coverage-v8`. 버전은 설치된 vitest 4와 맞춘다 | `bun run test:coverage`가 성공하는지 확인 | `chore(test): coverage-v8 추가로 test:coverage 복구` (lockfile 포함 1커밋) |

### (B)·(C) — 남은 질문
- **보류**: F-Q3 쿠키(F-1과 S5 쿠키 부분), `@testing-library/user-event`, Q7·Q8·C4 외부 헬스체크 ([DECISIONS](DECISIONS.md)). C12는 D-INFRA-swarm으로 해제되어 S24에 반영했다
- TM-Q1~Q8은 전부 권장안으로 확정됐다(D-TM-Q1~Q8) → S23
- **순서 결정 대기**: S12 착수 순서 (D-S12-order)

## 지금 어디까지
- 완료: 감사 보고서, 추가 조사 (a)(b)(c) → [WORKLOG 2026-10-15](WORKLOG.md)
- 완료: 사용자 답변 반영(DECISIONS 2차), F-Q3 쿠키 조사, S12에 `--detach=false` 반영
- **다음 할 일**:
  1. Dependabot PR #330~#334 처리 방침 — 사용자 확인 대기 (머지·닫기 금지)
  2. 후속 목록 — WORKLOG "리뷰 A·B 교차검증 루프"·"Playwright 실측 후속" 절의 후속 항목, S11 발견 프로덕션 의심 4건
  3. 이 문서 갱신분 커밋 (지시 대기)

## 진행 체크리스트
- [x] 감사 보고서
- [x] 추가 조사 (a) 삭제 댓글 · (b) 이메일·생일 · (c) 연동 상태 API
- [x] 실행계획·질문 목록
- [x] 착수 승인
- [x] S1 ~ S25 구현 (커밋 없음, WORKLOG "구현" 절)
- [x] S23
- [x] 리뷰 A·B 교차검증·수정 루프 (2라운드, 상·중 0건)
- [x] Playwright 화면 실측 (bun-4a) — 팝오버 FAIL 2건 수정 후 전부 PASS, 리뷰 4라운드 상·중 0
- [x] 커밋 30개 → PR #328(develop) → PR #329(main) 머지
- [x] 운영 배포 확인 (run 38704433056 success, Update completed, 4/4, 수렴 약 87초)
