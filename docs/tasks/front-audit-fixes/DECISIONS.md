# 결정 로그 — 프론트 전수조사 후속 수정

## 확정된 결정

| 날짜 | 결정 | 근거 / 출처 |
|---|---|---|
| 2026-10-15 | 기획 의도를 바꾸지 않는 수정·개선은 현업 수준의 베스트 프랙티스로 진행한다. 다만 이번 턴은 계획까지만 한다 | 사용자 (bun-4a 경유) |
| 2026-10-15 | 질문·확인·요청은 전부 bun-4a를 거쳐 사용자에게 확인받는다 | 사용자 (bun-4a 경유) |
| 2026-10-15 | 강퇴된 멤버가 초대 링크로 다시 가입하는 것은 의도된 정책이다 → 수정 대상이 아니다 | 사용자 (bun-4a 경유) |
| 2026-10-15 | 팀원끼리 이메일·생일을 보는 것은 허용이다 → 수정 대상이 아니다 (현재 프론트는 이 필드를 쓰지 않는다, WORKLOG (b)) | 사용자 (bun-4a 경유) |
| 2026-10-15 | 작업 브랜치는 `origin/develop`에서 만든다 | bun-4a 지시 |
| 2026-10-15 | 연동 상태(telegram/discord)는 관리 탭을 처음 열 때 조회한다. 이렇게 하면 비관리자는 조회하지 않는다 (S7) | 탭 자체가 `canManageInvites`일 때만 보인다(`TeamManagementSection.tsx:221,228`). 초기 진입에서 API 2건을 줄인다. 역할이 런타임에 바뀌어도 탭을 여는 시점에 판단하므로 안전하다 |

## 열린 질문

> 2026-10-15 기준 전부 해소 — 결과는 아래 2차~6차 절(D-F-Q*, D-UX, D-HOLD, D-TM-Q*)을 본다. 이 표는 질문 원문 기록용이다.

각 질문에 권장 기본값과, 답에 따라 무엇이 달라지는지 적었다.

| # | 분류 | 질문 | 권장 기본값 | 답에 따라 달라지는 것 |
|---|---|---|---|---|
| Q1 | B | 뷰를 바꿀 때 뒤로가기로 이전 뷰로 돌아가는 동작(`router.push`, V8)은 의도인가? | **replace로 변경** — 뒤로가기는 보드 이전 페이지로 간다 | replace: 1줄 수정. 상세→`router.back()` 복귀도 단순해진다. 유지: 변경 없음 |
| Q2 | C | `/api/test`(G1)를 삭제할까, production에서만 막을까? | **삭제** | 삭제: 파일 1개를 지운다(승인 필요). 차단: `NODE_ENV==='production'`이면 404 + env 로그 제거 |
| Q3 | C(백엔드 계약) | `access_token` 쿠키를 HttpOnly로 바꾸는 작업(G2)을 별건으로 진행할까? | **별건 태스크로 분리, 이번 범위 밖**. 이번에는 S5(삭제 속성 정합)만 한다 | 진행하면 백엔드 Set-Cookie 또는 Next route handler가 쿠키를 발급하는 구조로 바뀐다. 백엔드 브랜치와 동시 배포가 필요하다 |
| Q4 | C | 데드코드 약 600줄 삭제(G14)를 승인하는가? | **승인** — `useTeamData`·`ErrorBoundary`·미사용 export·`src/app/services/page.tsx`·빈 `api/og` | 승인: 1커밋. `.claude/rules/components.md`의 `LoadingSpinner` 항목도 함께 고친다. `ErrorBoundary`를 실제로 적용하길 원하면 삭제 대신 라우트 경계에 적용한다 |
| Q5 | C | `pnpm-lock.yaml`(C15)을 삭제해도 되는가? | **삭제** (CI·Docker는 `bun.lockb`만 쓴다) | 다른 사람이 pnpm을 쓰고 있다면 유지 |
| Q6 | C | `@vitest/coverage-v8`·`@testing-library/user-event`를 추가해도 되는가? | **coverage-v8만 지금 추가**, user-event는 컴포넌트 상호작용 테스트를 시작할 때 | 거부: `test:coverage` 스크립트를 제거하고 S10은 `fireEvent`로 작성 |
| Q7 | C(GitHub 설정) | GitHub `prod` environment에 브랜치 제한·승인자가 이미 있는가? | 모르면 **S12에 `if: github.ref == 'refs/heads/main'` 추가** | 이미 있으면 C1 코드 수정은 생략해도 된다 |
| Q8 | B | `workflow_dispatch`로 main이 아닌 ref를 배포하는 것(예: 구 sha로 수동 롤백)이 의도된 사용법인가? | **main만 허용 + `image_tag` 입력으로 롤백 경로 추가(C14)** | 의도라면 C1 대신 dispatch 입력 검증만 한다 |
| Q9 | B | 활성↔보관함 전환 때 뷰를 스켈레톤으로 바꾸지 않고 유지하며 갱신할까? (V7) | **유지 + 얇은 로딩 표시** | 바꾸면 캘린더 월·정렬·스크롤이 유지된다. 거부하면 현행 유지 |
| Q10 | B | 캘린더 월·리스트 정렬도 상세 왕복 시 보존할까(V9)? `teamBoardReturn` 플래그에 30분 만료를 둘까(V10)? | **둘 다 예** | sessionStorage `BoardState`에 필드 2개가 추가되고 테스트가 늘어난다 |
| Q11 | B | 보관함 탭 상태를 URL(`?tab=archive`)에 넣을까? (V11) | **예** (새로고침·공유 시 유지) | 아니면 현행처럼 상세 복귀 때만 복원한다 |
| Q12 | B | 모바일 터치 타깃을 44px로 키울까? 토글·칸반 점·캘린더 버튼 등 레이아웃이 약간 커진다 | **예** | 아니면 S10은 시맨틱만 고친다 |
| Q13 | B | 영문 라벨("List View"·"Calendar"·"Timeline"·"tasks"·"more")을 한국어로 바꿀까? (V21) | **예** (레포 규약: 한국어 UI) | 디자인상 영문 eyebrow가 의도라면 유지 |
| Q14 | B | 캘린더 "+n more" 표시 방식(V13), 팝오버를 위로 띄우는 것(V14), 칸반 높이 출렁임 완화(V12), 채팅 resync 최소 간격 30초(G9), swarm `monitor` 60s + parallelism 2(C12), 배포 후 외부 헬스체크(C4)를 진행할까? | **V13·V14·V12 예 / G9 예 / C12·C4 예** (C4는 도메인을 GitHub vars에 등록해야 함) | 항목마다 개별로 거부할 수 있다. C12는 배포 시간이 늘어난다(10 replicas) |

## 2026-10-15 (2차) — 사용자 답변 반영 (bun-4a 경유)

| ID | 결정 | 근거 / 출처 |
|---|---|---|
| D-F-Q1 | **기각** — 뷰 전환은 `router.push`를 유지한다. 뒤로가기로 이전 보기방식으로 돌아가는 것이 의도된 동작이다 (Q1) | 사용자 |
| D-F-Q2 | **`/api/test` 삭제 승인** (Q2) | 사용자. 근거(bun-4a 확인): 최초 추가 c4be2f4(2025-07-23, "CI/CD env test"), src·next.config 참조 0건 |
| D-F-Q5 | **`pnpm-lock.yaml` 삭제 승인** (Q5) | 사용자. 근거: 레포 패키지 매니저는 bun(`bun.lockb`, CI `oven-sh/setup-bun` + `bun install --frozen-lockfile`, `Dockerfile:5`). pnpm-lock 마지막 수정 bf40820(2026-02-02) |
| D-UX | **권장안으로 확정**: Q9(탭 전환 시 뷰 유지), Q10(월·정렬 보존 + 복귀 플래그 30분 만료), Q11(`?tab=archive`), Q12(터치 타깃 44px), Q13(라벨 한국어화), Q14의 UX 항목(+n more, 팝오버 위로, 칸반 높이, 채팅 resync 30초) | 사용자 |
| D-HOLD | **보류 — 손대지 않는다**: Q7(prod environment 브랜치 제한), Q8(dispatch 배포 범위, C1·C14), Q14 중 swarm `monitor`/`parallelism`(C12)·외부 헬스체크(C4) | 사용자 |
| D-PENDING | **미답변 — 착수 금지**: Q4(데드코드 삭제), Q6(의존성 2개) | 재질문 예정 |
| D-S12-detach | S12에 `docker stack deploy --detach=false`를 추가한다. 기존 계획(C3, `UpdateStatus` 판정)과 **합친다**. `--detach=false`를 1차 대기로 쓰고, 그다음 `UpdateStatus.State`를 명시적으로 검사해 최종 성공/실패를 판정한다. Replicas 폴링 루프는 제거한다 | 근거(bun-4a·bun-37): workflow:99에 `--detach=false`가 없어 stack deploy가 업데이트를 예약만 하고 반환한다. 그다음 Replicas 폴링은 기존 태스크를 센다. run 38530773208 로그에 `Since --detach=false was not specified, tasks will be created in the background.`·`Converged at 0s: 10/10`이 찍혔다. 즉 새 이미지가 기동에 실패해도 success로 남는다. 로그의 `err:` 접두사는 appleboy/ssh-action이 원격 stderr 줄에 붙이는 표시이고 실패를 뜻하지 않는다. 합치는 이유: `--detach=false`를 지원하는 것은 이 로그 문구로 확인됐다. 다만 롤백이 끝난 뒤의 종료코드가 버전마다 같다고 코드로 보장할 수 없다. 그래서 `UpdateStatus`(`completed`만 성공, `rollback_*`/`paused`는 실패)로 한 번 더 판정한다 |
| D-F-Q3-proposal | (**제안 — 사용자 확인 대기**) `access_token` 쿠키를 HttpOnly로 바꾸는 대신 **쿠키를 없애고 Bearer로 일원화**한다. 백엔드는 Bearer를 먼저 보도록 순서를 바꾼다 | WORKLOG 2026-10-15 "F-Q3 조사". 이 안이 채택되면 S5의 쿠키 삭제 헬퍼는 F-1(쿠키 정리)로 대체된다 |

## 2026-10-15 (3차) — 사용자 결정 반영 (bun-4a 경유)

| ID | 결정 | 근거 / 출처 |
|---|---|---|
| D-F-Q4 | **데드코드 약 600줄 삭제 승인**. 1커밋(S18)으로 진행하며 `.claude/rules/components.md`의 `LoadingSpinner` 항목 수정도 포함한다. supersedes D-PENDING의 Q4 | 사용자 |
| D-F-Q3 | **보류**. Bearer 일원화(F-1)와 S5의 쿠키 관련 부분을 모두 착수하지 않는다. S5는 G4(signOut 1회 가드)만 남긴다. 조사 결과는 WORKLOG "F-Q3 조사"에 그대로 둔다. supersedes D-F-Q3-proposal | 사용자 |
| D-F-Q6 | **미답변, 보류 유지**. 의존성 2개를 추가하지 않는다 | 사용자 |
| D-S12-order | S12의 계획 내용(`--detach=false` + `UpdateStatus` 판정)은 유지한다. **착수 순서는 사용자 답을 받은 뒤 정한다**. 사용자에게 swarm `update_config` 값과 함께 재설명하는 중이다. supersedes STATUS "S12 먼저" 순서 | 사용자 (bun-4a 경유) |

### `/time-measurement` 열린 질문 (TM-Q)

| # | 질문 | 권장 기본값 | 답에 따라 달라지는 것 |
|---|---|---|---|
| TM-Q1 | 종료 ≤ 시작(예: 22:00→06:00)을 야간 근무로 보고 종료를 다음 날로 해석할까? 시작=종료는? | **예. 시작=종료는 "시작과 종료가 같습니다" 안내** | 아니오: 종료 < 시작이면 입력 오류 메시지만 띄운다 |
| TM-Q2 | 배터리 숫자를 남은 비율로 바꿀까?(지금은 채움=남음인데 숫자=경과) | **예. 숫자=남은 %, 라벨 "남음"** | 아니오: 채움을 경과(차오르는 방식)로 바꿔 숫자와 맞춘다 |
| TM-Q3 | 시간 입력 변경을 히스토리에 쌓지 않을까(`replace`)? | **예(replace + scroll:false)** | 아니오: 현행 push 유지 |
| TM-Q4 | 애니메이션 선택을 URL(`?anim=`)로 유지할까? | **예** | 아니오: 현행(새로고침 시 배터리) 유지. localStorage를 원하면 그쪽으로 |
| TM-Q5 | "시작 전" 상태(시작까지 카운트다운)와 "완료" 상태(섹션 유지 + 00:00:00 + 완료 배지)를 도입할까? | **예** | 아니오: 현행 유지(TM15·16 레이아웃 이동 잔존) |
| TM-Q6 | 진행률 중복 칸을 "경과 시간"으로 바꿀까? | **예** | 아니오: 현행 유지 |
| TM-Q7 | 영문·음역 라벨을 한국어로 바꿀까?("Time Tracker", charge/orbit/wave/focus, 오비트/웨이브) | **예** | 아니오: 영문 eyebrow 디자인 유지 |
| TM-Q8 | 탭 제목에 남은 시간을 표시할까?(새 기능) | **이번 범위 밖** | 예: S23에 `document.title` 갱신 추가(언마운트 시 복원) |

## 2026-10-15 (4차) — 사용자 결정 반영 (bun-4a 경유)

| ID | 결정 | 근거 / 출처 |
|---|---|---|
| D-INFRA-replicas | 프론트 레플리카를 **10 → 4**로 줄인다(`infra/docker-stack.app.yml:27` `deploy.replicas`). 별도 슬라이스 S24 `chore(infra)`로 진행한다 | 사용자 |
| D-INFRA-swarm | Swarm 설정은 **추천안대로 확정**하고 백엔드 D-008과 같은 값으로 맞춘다. <br>• `update_config.monitor`: 10s → **60s** <br>• `parallelism`: **1 유지**(레플리카 4라 2로 올리지 않음) <br>• `order: start-first`, `failure_action: rollback`: 유지 <br>• `restart_policy`: `max_attempts: 3`, `window: 120s` 추가 <br>이 결정으로 D-HOLD의 C12(monitor·parallelism) 보류는 해제된다. 외부 헬스체크(C4)·Q7·Q8은 계속 보류한다 | 사용자 |
| D-INFRA-healthcheck | 헬스체크를 일원화할 필요가 없다. `Dockerfile`에 `HEALTHCHECK`가 없고(grep 0건), 스택(`docker-stack.app.yml:16-25`)에만 있어 **이미 스택으로 일원화된 상태**다. 변경하지 않는다 | 확인 결과 |
| D-S12-script | 배포 스크립트 사양을 확정한다(기존 S12 합본 계획에 덧붙임). <br>• `set -euo pipefail` <br>• `docker stack deploy --detach=false` <br>• 성공은 `UpdateStatus.State == completed`일 때만 <br>• 실패하면 `docker service ps`를 출력하고 `exit 1` <br>• 전체 대기 상한 15분 | 사용자 |
| D-F-Q6-approved | `@vitest/coverage-v8`만 추가한다. lockfile 변경은 같은 커밋에 넣는다. `@testing-library/user-event`는 보류한다. supersedes D-F-Q6 | 사용자 |

## 2026-10-15 (5차) — `/time-measurement` TM-Q 확정 (bun-4a 경유)

| ID | 결정 | 출처 |
|---|---|---|
| D-TM-Q1 | 종료 ≤ 시작이면 종료를 다음 날로 해석한다(야간). 시작 = 종료이면 안내 문구를 띄운다 | 사용자 (권장안) |
| D-TM-Q2 | 배터리 숫자는 남은 %로, 라벨은 "남음"으로 바꾼다. 채움(남은 비율)은 그대로 둔다 | 사용자 (권장안) |
| D-TM-Q3 | 시간 입력 변경은 `router.replace(..., { scroll: false })`로 처리한다 | 사용자 (권장안) |
| D-TM-Q4 | 애니메이션 선택을 `?anim=` URL 파라미터로 유지한다. 유효값만 받는다 | 사용자 (권장안) |
| D-TM-Q5 | "시작 전" 상태(시작까지 카운트다운)와 "완료" 상태(섹션 유지 + `00:00:00` + 완료 배지)를 도입한다 | 사용자 (권장안) |
| D-TM-Q6 | 통계 그리드에서 중복되는 진행률 칸을 "경과 시간"으로 바꾼다 | 사용자 (권장안) |
| D-TM-Q7 | 영문·음역 라벨을 한국어로 바꾼다 | 사용자 (권장안) |
| D-TM-Q8 | 탭 제목 카운트다운은 **범위 밖**이다 | 사용자 (권장안) |

## 2026-10-15 (6차) — bun-4a 교차 리뷰 반영

| ID | 결정 | 근거 / 출처 |
|---|---|---|
| D-INFRA-restart | **D-INFRA-swarm 일부를 supersedes**: `restart_policy`에 `max_attempts: 3`·`window: 120s`를 넣지 않는다. 대신 `delay: 10s`를 넣는다. S24 커밋 제목도 "재시작 상한"에서 "재시작 간격"으로 바꾼다 | bun-4a 정정(백엔드 D-009). 재시작 상한이 있으면 장애가 몇 분만 이어져도 Swarm이 태스크를 포기한다. 그러면 원인이 해소돼도 다음 배포 전까지 서비스가 내려가 있다. 무상태 서비스는 스스로 복구할 수 있어야 한다 |
| D-ORDER-proposal | (**제안 — 사용자 확인 대기**) 착수 순서는 S13 → S12 → S24 → S1 → 나머지 번호순 | S24 검증(레플리카 4/4, 수렴)은 S12가 고친 판정 로그에 의존하므로 둘을 연달아 둔다 |

## 2026-10-15 (7차)

| ID | 결정 | 출처 |
|---|---|---|
| D-TM-overnight | 야간 구간(종료 ≤ 시작)은 끝난 뒤 '완료'로 표시하지 않고 곧바로 '시작 전'(다음 시작까지)으로 넘어간다. **현재 동작을 유지**한다(권장 기본값). 코드 변경은 없다. `timeRange.test.ts`의 야간 케이스가 이 동작을 고정한다 | 사용자 "나머지 확인 완료" (bun-4a 경유) |
