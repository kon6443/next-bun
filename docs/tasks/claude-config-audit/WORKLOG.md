# next-bun Claude 설정 감사 — 작업 기록

> append-only. 새 절은 맨 아래에. 통째로 읽지 말고 `grep -n "^## \|^### "`로 목차를 본 뒤 필요한 절만 읽는다.

## 2026-10-07 — 전수조사·비교·추천 (조사 단계)

방법: 서브에이전트 4개를 병렬로 돌렸다(레포 인벤토리, 글로벌 비교, 비교 레포 F(Next.js) 비교, 공식 문서 조사). 결론이 걸린 값은 메인에서 원본으로 다시 확인했다(아래 "재확인" 표). 백엔드 공통 사항(형제 훅, 교차 로드)은 `../bun/docs/tasks/tasks-claude-config.md`에 정리돼 있어 여기서는 링크만 둔다.

### 인벤토리 (next-bun)
| 경로 | 줄 | 역할 | 로드 |
|---|---|---|---|
| `CLAUDE.md` | 63 | 규약, 금지, 라우팅 | 자동 |
| `README.md` | 39 | 사실, 사용법, 배포 | 수동 |
| `.claude/settings.json` | 66 | deny(DB 명령, `Edit(.claude/settings.json)`), ask(ssh·scp·redis-cli), 훅 2개, `additionalDirectories: ../bun` | 자동 |
| `.claude/settings.local.json` | 46 | 개인 allow 37개(gitignore 대상) | 자동 |
| `.claude/hooks/inject-sibling-claudemd.sh` (+test) | 155 / 108 | 형제 레포 CLAUDE.md와 rules 주입, 회귀 테스트 | 훅 |
| `.claude/rules/ui.md` · `nextauth.md` | 147 / 18 | paths 한정 규칙 | 자동(paths) |
| `.claude/skills/bun/SKILL.md` | 37 | 백엔드 계약 조사 절차 | 스킬 |
| `.claude/agents/backend-researcher.md` | 129 | 백엔드 API 조사(sonnet, Read/Glob/Grep). 최종 커밋 2026-03-26으로 가장 오래됨 | 위임 |
| `.claude/commands/review-flow.md` | 50 | `/review-flow` QA 리뷰 | 수동 |
| `docs/assistant_workflow.md` · `assistant_rules_diagnostics.md` · `swagger_info.md` | 23 / 7 / 8 | 라우팅 대상 | 라우팅 |
| `docs/KAKAO_LOGIN_ISSUE.md` | 136 | 카카오 지연 이슈 기록. 라우팅 표에 없음 | 없음 |
| `docs/tasks/*.md` 6개 | 49~326 | 평면 태스크 문서 | 수동 |
| `.mcp.json` · `AGENTS.md` · `CLAUDE.local.md` | — | 없음 | — |

### 발견 표
| # | 파일:라인 | 문제 | 심각도 |
|---|---|---|---|
| F1 | memory `MEMORY.md:25` | "표시는 UTC 기준(타임존 변환 방지)"라고 적혀 있다. 코드(`src/app/utils/dateUtils.ts:5` "브라우저 로컬 타임존으로 변환하여 표시")와 CLAUDE.md Conventions가 이와 반대다. 매 세션 자동 로드되는 메모리가 틀린 규칙을 주입한다 | 높 |
| F2 | memory `MEMORY.md` Tech Stack | "@dnd-kit 설치됨"이라고 적혀 있으나 `package.json`에 dnd 항목이 없다 | 중 |
| F3 | `.claude/settings.local.json:15-18,29,40` | allow에 `docker exec:*`, `redis-cli FLUSHALL`, `xargs … redis-cli DEL`, `pnpm run:*`, `find:*`가 들어 있다. `settings.json:37`의 ask `redis-cli*`, 글로벌 ask `docker *`, CLAUDE.md "Ask: docker"와 충돌한다 | 높 |
| F4 | `docs/assistant_workflow.md:8-9` | ":9 수정된 파일만 린트"가 프로젝트 DoD("`bun run lint` 에러 0")와 어긋난다. ":8 모호하면 충분히 질문"은 글로벌 규칙("질문 1개 + 디폴트")과 어긋난다. :17-19는 CLAUDE.md "자동 로드" 절과 중복이다. :21-23 "새 규칙은 /docs에"는 문서 경계와 어긋난다 | 중 |
| F5 | DB 금지 4중 중복 | `CLAUDE.md:29`, `CLAUDE.md:43`(같은 문서 안에서 반복), `skills/bun/SKILL.md:35`, `settings.json` deny | 중 |
| F6 | blur 금지 3중, 어조 충돌 | CLAUDE.md Never는 금지형이고 `rules/ui.md:40-61,144-145`는 "사용 시 테스트" 허용형이다. 메모리에도 같은 내용이 있다 | 중 |
| F7 | memory `MEMORY.md` ↔ CLAUDE.md | 한국어 UI, ApiError, 상태 5종, 역할 계층, blur, alias가 중복이라 매 세션 두 번 로드된다 | 중 |
| F8 | memory `feedback_overflow_hidden.md` | 경로 한정 UI 규칙(`input[date]`/`select`의 `max-w-full box-border appearance-none`)이 `ui.md`에 없고 메모리에만 있다 | 중 |
| F9 | `agents/backend-researcher.md:39-44,78-98` | 백엔드 스택과 계약 값(날짜, 응답, 에러)을 복제해 두었다. `skills/bun/SKILL.md`의 "값의 SSOT는 백엔드" 원칙과 충돌하고 낡았을 가능성이 있다. :16-35의 경로 탐색 3단계는 `../bun` 고정과 맞지 않는 과설계다 | 중 |
| F10 | `docs/KAKAO_LOGIN_ISSUE.md:6-7` | "현재 상태: 미해결"과 "부분 정정됨(2026-08-21)"이 같은 블록에서 충돌한다. 상태성 문서인데 `docs/tasks` 밖에 있다 | 중 |
| F11 | `docs/swagger_info.md:7-8` | `localhost:3500`만 있고 Prod 주소가 없다(메모리에는 있음) | 낮 |
| F12 | `.claude/commands/review-flow.md:27,39-40` | `task.ts` 경로가 모호하다(실제 `src/app/types/task.ts`). sandbox build 함정이 반영되지 않았다. 내용이 글로벌 `review` 스킬과 상당 부분 겹친다 | 낮 |
| F13 | `rules/ui.md:7`, `rules/nextauth.md:9` | 규칙 본문에 이동 이력과 날짜(2026-09-23)가 들어 있다 | 낮 |
| F14 | `skills/bun/SKILL.md:6-8` | 결정 근거를 외부 레포 작업 ID(`tasks-claude-config.md C3-6`)로 주석에 달았다 | 낮 |
| F15 | `settings.json:25` | `Edit(.claude/settings.json)`만 deny다. Write는 sandbox `denyWithinAllow`가 막고 있어 실효상 문제는 없다 | 낮 |
| G1 | 글로벌 `rules/workflow.md:35-36,66`, `error-recovery.md:53` | "lessons 파일"을 가리키지만 실체 경로가 정의돼 있지 않다(dotfiles에서 `*lesson*` 0건) | 중(글로벌) |
| G2 | 글로벌 allow | `pnpm/npm/yarn`만 있고 `bun`이 없다. 그래서 프로젝트 local이 보완하고 있다 | 낮 |

글로벌과 겹치는 항목은 DoD 일부, commit/push 보호, DB 보호(글로벌은 쿼리 문자열 훅, 프로젝트는 마이그레이션 deny로 서로 보완)이다. 충돌은 F3, F4만 있다. 같은 이름의 skill/agent는 없다(`review` vs `review-flow`).

### CLAUDE.md 상태성 문구 위치
| 라인 | 원문 | 성격 |
|---|---|---|
| 19 | 라우팅 표 "카카오 로그인 지연" 행 "— "카카오 탓" 결론은 부분 정정됐다" | 조사 결론의 정정 이력. 대상 문서에 있어야 한다 |
| 42 | "백엔드 `CLAUDE.md`는 주입 상한(약 9천 자)을 넘으므로 "지금 Read하라"는 지시가 온다" | 수치와 현재 상태. 백엔드 CLAUDE.md가 9천 자 아래로 줄면 거짓이 된다. 훅이 런타임에 알려 주므로 불필요하다 |
| 35 | Never 표 commit·push 행 "(`…yml` — `docs/**`·`*.md`만 바꾼 push는 제외)" | 워크플로 설정 현황. README.md:39와 중복이다(README 소관) |
| 44 | "Claude 설정·훅·교차 로드 작업 이력은 `../bun/docs/tasks/…`가 SSOT다" | 이력 포인터. 상태값은 아니지만 "작업 이력"을 CLAUDE.md에서 라우팅한다. 라우팅 표 행으로 옮기면 된다 |

같은 성격의 문구가 CLAUDE.md 밖에도 있다. `rules/ui.md:7`, `nextauth.md:9`(이동 이력), `skills/bun/SKILL.md:6-8`(외부 작업 ID), `hooks/inject-sibling-claudemd.sh:19-22`(2026-09-23 실측 수치, 스크립트 주석이라 허용 범위), `docs/KAKAO_LOGIN_ISSUE.md:5-8`.

### 추천안
| # | 항목 | Before | After | 장점 | 단점 | 근거 |
|---|---|---|---|---|---|---|
| R1 | CLAUDE.md 상태성 문구 제거 | L19 정정 문구, L42 "약 9천 자", L35 paths-ignore 설명 | L19는 문서 경로만 남긴다. L42는 "훅 지시를 따른다"만 남긴다. L35는 README로 일원화한다 | 낡지 않는다. 사용자 원칙(CLAUDE.md에 추적 기록 금지)을 지킨다 | 맥락 1줄이 사라진다(대상 문서에 있음) | memory 문서 "CLAUDE.md는 규칙, 휘발 정보 제외" https://code.claude.com/docs/en/memory |
| R2 | 메모리 정정과 중복 제거 | F1 UTC 오류, F2 dnd-kit, F7 중복 6항목 | F1, F2는 정정한다. CLAUDE.md와 겹치는 규약은 메모리에서 삭제한다. F8 overflow 규칙은 `ui.md`로 옮긴다 | 틀린 규칙 주입이 멈춘다. 로드 토큰이 줄어든다 | 메모리는 sandbox상 사용자가 직접 적용해야 한다(Q1) | `dateUtils.ts:5` · memory 문서 auto memory 절 |
| R3 | settings.local.json 위험 allow 정리 | F3 | 파괴·우회 allow 5종과 일회성 절대경로 항목을 제거한다 | ask 정책이 실제로 걸린다. FLUSHALL 사고를 막는다 | 해당 명령마다 프롬프트가 다시 뜬다 | permissions 문서(규칙은 deny→ask→allow 순으로 평가, 설정 병합은 local > project > user) https://code.claude.com/docs/en/permissions |
| R4 | `docs/assistant_workflow.md` 정리 | F4(충돌 2건, 중복 2건) | 충돌하는 :8-9를 삭제하고 중복 :17-23도 삭제한다. 남는 고유 절차가 없으면 파일과 라우팅 행을 삭제한다 | 규칙 충돌이 사라진다 | 파일 삭제는 Ask 대상이다 | `CLAUDE.md:5` 문서 경계 |
| R5 | 중복 1곳 일원화 | F5 DB 4중, F6 blur 3중(어조 충돌) | DB는 CLAUDE.md Never 1행과 deny만 둔다(`:43`, `SKILL.md:35` 삭제). blur는 CLAUDE.md Never를 정본으로 삼고 `ui.md`는 "Never 참조"로 바꾼다. 또는 반대로 하되 금지형으로 통일한다 | 같은 규칙이 다르게 해석되지 않는다 | 스킬만 로드된 맥락에서는 금지 문구가 안 보인다(deny가 있어 실효는 유지됨) | `CLAUDE.md:5` "같은 내용을 두 곳에 쓰지 않는다" |
| R6 | 읽기 전용 리뷰 에이전트 | `/review-flow` 커맨드(메인 컨텍스트에서 자기 코드를 리뷰). 글로벌 `review` 스킬과 겹침 | `.claude/agents/review-front.md`(tools: Read, Grep, Glob, Bash. Edit/Write 없음)를 둔다. 판정 기준은 글로벌 `review` 스킬을 참조하고 프로젝트 고유 체크(self-event 필터, 낙관적 롤백, ConfirmModal, `../bun` DTO)만 담는다. `review-flow.md`는 진입점으로 축소한다 | 생성자 편향을 제거한다. 메인 컨텍스트를 보호한다. 글로벌과 중복이 사라진다 | 에이전트 호출 비용과 지연이 생긴다. 지침이 두 곳으로 나뉜다 | 비교 레포 F(Next.js) `.claude/agents/review-front.md:1-8` · https://code.claude.com/docs/en/sub-agents |
| R7 | 계약 대조 에이전트로 정비 | `backend-researcher` 129줄. 값을 복제하고 경로 탐색이 과설계다(F9) | 값 복제와 경로 탐색 절을 삭제하고 "FE 파일:라인 ↔ BE dto:라인을 양쪽 다 제시, 0건이면 대조군 제시" 규율을 추가한다(비교 레포 F `contract-check` 7축 참고) | 타입 드리프트를 검증할 수 있다. 낡은 값을 주입하지 않는다 | 기존 프롬프트를 다시 써야 한다. 효과는 사용해 봐야 알 수 있다 | 비교 레포 F(Next.js) `.claude/agents/contract-check.md:14,22-29` · `skills/bun/SKILL.md`("SSOT는 백엔드") |
| R8 | 커밋 전 리마인더 훅 | 커밋 보호는 문서(Never)와 글로벌 ask만 있다 | PreToolUse(Bash)에서 `git commit`을 감지하면 `additionalContext`로 "lint·typecheck·test:run 했나"를 주입한다(비차단) | `main` push가 곧 배포인 레포에서 마지막 점검이 된다. 비용이 거의 없다 | 리마인더라 강제력이 없다. Bash 호출마다 jq가 1회 실행된다 | 비교 레포 F(Next.js) `.claude/settings.json:61-65` · hooks 문서 PreToolUse https://code.claude.com/docs/en/hooks |
| R9 | 편집 후 자동 lint (선택) | 정적 검증은 DoD 문서뿐이다 | PostToolUse(`Edit\|Write`, `src/**/*.{ts,tsx}`)에서 해당 파일에 `bunx eslint`를 돌리고 에러만 exit 2로 피드백한다 | 린트 에러를 즉시 교정한다. DoD 1항을 자동화한다 | 편집마다 1~3초 지연이 생긴다. 중간 상태에서 오탐이 날 수 있다. 처음엔 리마인더형(R8 방식)으로 시작하는 것을 권장한다 | hooks-guide PostToolUse 예시 https://code.claude.com/docs/en/hooks-guide |
| R10 | 카카오 이슈 문서 위치 | `docs/KAKAO_LOGIN_ISSUE.md`(상태값 충돌, 라우팅 없음)와 라우팅 표는 `../bun` 문서를 가리킴 | `docs/tasks/`로 옮기거나 상단에 "SSOT는 `../bun/docs/tasks/tasks-kakao-login-latency.md`" 1줄을 두고 상태 블록을 삭제한다 | 상태값이 두 곳에 있지 않게 된다 | 기존 링크가 바뀐다 | `CLAUDE.md:5` |
| R11 | rules 본문 이력 제거 | F13, F14 | 이동 이력과 외부 작업 ID 주석을 삭제한다(근거는 git log와 `../bun` 태스크 문서에 있음) | rules가 규칙만 담게 된다 | 없음 | memory 문서 rules 절 |
| R12 | AGENTS.md / Next 번들 문서 | Next 15.3.8이라 `node_modules/next/AGENTS.md`, `dist/docs`가 없다 | 지금은 보류한다. Next 16 업그레이드 시 생성되는 `AGENTS.md`를 CLAUDE.md에서 `@AGENTS.md`로 import한다 | 버전에 맞는 API 문서를 쓰게 된다 | 지금은 적용할 수 없다 | https://nextjs.org/docs/app/guides/ai-agents |
| R13 | (글로벌, bun-cc 취합) lessons 경로 정의 | G1: 참조만 있고 실체가 없다 | 글로벌 rules에 경로를 정하거나(예: 프로젝트 `docs/lessons.md`) 문구를 삭제한다 | 따를 수 없는 규칙이 사라진다 | 글로벌 변경이라 사용자가 직접 적용해야 한다 | `rules/workflow.md:35` |

보류한 것: 하위 디렉토리 CLAUDE.md(단일 앱이라 불필요), 비교 레포 F식 387줄 CLAUDE.md(현재 63줄이 공식 권장 200줄 미만에 부합), Sentry 스킬(미사용), config-guard 훅(sandbox `denyWithinAllow`가 이미 `.claude/settings.json`·hooks·skills 쓰기를 막고 있다).

next-bun이 앞선 것(비교 레포 F(Next.js) 대비): CLAUDE.md 63줄과 문서 경계 선언, 형제 규약 자동 주입 훅과 회귀 테스트, 빌드·테스트 함정의 Never 표 명시.

### 재확인 (서브에이전트 보고 → 원본)
| 주장 | 확인 | 결과 |
|---|---|---|
| @dnd-kit 미설치 | `grep dnd package.json` → 0건 | 사실 |
| 날짜 표시 방식 | `dateUtils.ts:5` "로컬 타임존으로 변환하여 표시" | 메모리가 틀림 |
| local allow 위험 항목 | `settings.local.json:15-18,29,40` | 사실 |
| `review-flow.md`의 `task.ts` 깨짐 | `src/app/types/task.ts` 존재 | **정정**: 경로가 모호할 뿐 깨지지 않음(D-002) |
| lessons 실체 없음 | dotfiles `*lesson*` 0건 | 사실 |
| 비교 레포 F 리뷰 에이전트와 훅 | `review-front.md` frontmatter, `settings.json:61-85` | 사실 |
| "additionalContext는 UserPromptSubmit만" | 이 세션 PreToolUse 훅 주입 | **정정**: 틀림(D-002) |
| jq 의존 훅 무력화 위험 | `/usr/bin/jq` 존재 | 이 머신에서는 해당 없음 |

## 2026-10-07 — 이름 노출 검사 (D-003)

명령: `git ls-files | xargs grep -niE '<회사명>|<비교 레포 이름>|<개인 절대경로>|<사용자명>'`. 패턴 원문은 이름 자체라 여기에 쓰지 않았다.

| 구분 | 파일:라인 | 내용 | 조치 |
|---|---|---|---|
| 설정 위반 | `.claude/skills/bun/SKILL.md:7` | HTML 주석에 비교 레포 B의 실명과 그쪽 작업 ID(F39)가 있다 | 보고만 했다. 제안: `(…와 같은 판단)` 괄호를 삭제한다(R11과 함께) |
| 오탐 | `src/services/teamService.ts:917,966`, `userService.ts:59` | `/api/v1/.../users/...` 경로가 `/Users/` 패턴에 대소문자 무시로 걸렸다 | 해당 없음 |
| 이력 문서 | 이 폴더 STATUS/DECISIONS/WORKLOG | 비교 레포 실명 11곳 | 익명 표기로 치환했고 재검사 결과 0건 |
| 이력 문서 | `docs/tasks/*.md` 기존 6개, `README.md`, `docs/*.md` | 0건 | — |

CLAUDE.md와 `.claude/settings.json`, hooks, rules, agents, commands에서는 0건이다(개인 절대경로도 없다). 미추적 `.claude/settings.local.json`은 커밋 대상이 아니라 검사하지 않았다.

### bun-cc가 공유한 공식 사실 반영 (정정)
- F15 정정: Edit 권한 규칙은 Write 등 모든 편집 도구에 적용된다. 따라서 `Edit(.claude/settings.json)` deny만으로 충분하고 F15는 문제가 아니다.
- R1 보강: CLAUDE.md의 블록 레벨 HTML 주석은 컨텍스트에 주입되기 전에 제거된다. L42의 수치 근거처럼 관리자가 남겨 둘 메모는 삭제하는 대신 주석으로 옮기면 된다.
- 감사 도구: `/doctor prompt-audit`으로 지시 파일의 낡음과 충돌을 재검사할 수 있다(적용 단계 검증 명령 후보).

## 2026-10-07 — 적용 패치 준비 (R1~R11, 규칙 분할, 훅 동기화)

### 산출물 (세션 scratchpad — 커밋 대상 아님)
- `next-bun-claude-config.patch`: 21파일, +229/−328 줄. 실제 레포에 `git apply --check` 통과
- `user-settings-json.patch`: R8 커밋 리마인더 훅. `settings.json`은 Edit deny라 사용자가 적용
- `user/memory.diff`: R2. `user/settings-local.diff`: R3

### 변경 파일 (줄수 전→후)
| 파일 | 전→후 | 내용 |
|---|---|---|
| `CLAUDE.md` | 63→57 | 상태성 문구 4곳 제거(L19 정정 문구, L42 "약 9천 자", L32 paths-ignore → README 참조, L44 → 라우팅 행). DB 중복 L43 삭제. 파일 종류 규약은 rules로 이동. blur Never를 `backdrop-blur-*`까지 명시. `assistant_workflow` 행 삭제. 리뷰 라우팅 행 추가 |
| `.claude/rules/ui.md`, `nextauth.md` | 147, 18→삭제 | 6개로 분할 (D-005) |
| `.claude/rules/components·styles·services·socket·auth·tests.md` | 신규 33/22/19/14/22/15 | |
| `.claude/agents/review-front.md` | 신규 38 | 읽기 전용 리뷰어 (R6) |
| `.claude/commands/review-flow.md` | 50→6 | 에이전트 위임 진입점 (R6) |
| `.claude/agents/backend-researcher.md` | 129→87 | 경로 탐색 3단계·스택·계약 값 복제 삭제 → `../bun` rules SSOT 참조, 양쪽 근거·대조군 규율 추가 (R7). 자체 서비스명 표기 제거 |
| `.claude/skills/bun/SKILL.md` | 37→35 | 비교 레포 실명·작업 ID 제거(D-003). `code-patterns.md`·§번호 → `api-http.md`·`realtime-ws.md`·`datetime.md`. DB 금지 중복 삭제. "주입 상한" 상태 서술 제거 |
| `.claude/hooks/*.sh` 2개 | 155→163, 108→121 | 백엔드 사본과 바이트 동일 (마커 후생성 + V6 테스트) |
| `docs/assistant_workflow.md` | 23→삭제 | 고유 2줄 이전(rules-of-hooks → components, 진단 로그 플래그 → diagnostics). 나머지는 DoD·글로벌과 중복 또는 충돌 |
| `docs/assistant_rules_diagnostics.md` | 7→8 | 위 1줄 이전 |
| `docs/swagger_info.md` | 8→9 | 실제 주소 출처 `NEXT_PUBLIC_API`(`FetchService.ts:328`) 명시 |
| `docs/KAKAO_LOGIN_ISSUE.md` | 136→133 | 충돌하던 상태 블록을 "SSOT는 `../bun` 태스크 문서" 1줄로 교체 (R10) |
| `README.md` | 39→39 | rules 설명 "파일 종류별" |
| `src/app/components/UserAvatar.tsx` | 주석 1줄 | `rules/ui.md` → `rules/components.md` |

### 근거 확인 (규칙에 쓴 사실 → 코드)
| 규칙 | 근거 |
|---|---|
| API 함수 형태 | `teamService.ts:22-68` `handleApiError`, `getMyTeams`/`createTeam`의 `backendFetch` + `handleApiError`(25회). `ApiError`는 `src/types/api.ts:95` |
| 422 `VALIDATION_ERROR` | `FetchService.ts:168` · 백엔드 `CLAUDE.md` Key Patterns(`forbidNonWhitelisted`) |
| self-event | `useTeamSocketEvents.ts:76-109` `isSelfTriggered` |
| `TeamSocketEvents` | `src/types/socket.ts:5` |
| ConfirmModal | `src/app/components/ConfirmModal.tsx` (사용처 5파일) |
| glass 토큰 | `bg-slate-800/50` 12회, `border-slate-700/50` 22회 |
| 로그인 로딩 | `auth/shared.ts` `startKakaoLogin` → `AUTH_LOADING_KEY`. `AuthLoadingOverlay`는 `layout.tsx:88`. `clearAuthLoading`은 `auth/error/page.tsx:93` — **기존 `ui.md` §3(`searchParams.get("code")` 방식)은 코드에 없어 낡은 규칙이었다** |
| 테스트 환경 | `vitest.config.mts`(`environment: 'node'`, `setupFiles` 없음). `src/test/setup.ts`는 미연결 |
| 로딩 컴포넌트 | `teams/components/index.ts:2` export, `globals.css:25,46` `barLoader` |

### 검증
- rules paths: 스크립트(`git ls-files` + glob→regex)로 확인했다. 모든 glob이 1개 이상 매칭된다. 예외는 `**/*.test.tsx` 0건으로, 향후 컴포넌트 테스트용이다. 결과 표는 회신에 첨부했다
- 훅: 복사본에서 `sh .claude/hooks/test-inject-sibling-claudemd.sh` → `PASS=30 FAIL=0`. `cmp` 결과 백엔드 사본 2개와 동일하다
- 이름 노출 재검사: 복사본 전체에서 0건이다(API `/users/` 오탐은 제외)
- 참조 실재: 변경 문서의 백틱 경로를 전수 검사했다. 미해결 7건은 모두 basename이거나 백엔드 상대경로 오탐이다(KAKAO 본문은 수정하지 않은 과거 기록)
- lint: 코드 변경은 주석 1줄뿐이다. `bunx eslint --stdin`(UserAvatar 복사본) 결과 rc=0. typecheck·test:run은 코드 동작 변경이 없어 생략했다
- R8 훅: 시험 입력 `git commit` → additionalContext JSON 출력, `ls` → 무출력, rc 0

### 자체 prompt-audit (낡은 지시 · 없는 참조 · 상호 모순)
| 유형 | 위치 | 조치 |
|---|---|---|
| 낡은 지시 | `ui.md` §3 OAuth 콜백 감지 | `auth.md`를 실제 구현으로 다시 씀 |
| 낡은 지시 | `SKILL.md` `code-patterns.md` §번호 | 백엔드 rule 파일명으로 교체 |
| 없는 참조 | `assistant_workflow.md:17` `/docs/...` 선행 슬래시 | 파일 삭제 |
| 상호 모순 | lint 범위(assistant_workflow ↔ DoD), blur 금지형 ↔ 허용형, 질문 규칙 | 삭제·통일 |
| 상호 모순(코드) | Never(blur) ↔ 기존 코드 3곳: `CalendarView.tsx:477`, `StatusDropdown.tsx:168`, `src/styles/teams.ts:55` | 규칙은 "새 코드" 금지로 명시. 기존 사용처 교체는 별건 TODO (UI 실기기 확인 필요) |
| 정정 | 이전 회신의 "CLAUDE.md L35" | 실제 L32 |
| 정정 | 이전 F(deny에 bun 변형 없음) | 백엔드는 pnpm(`../bun/CLAUDE.md` Commands)이라 pnpm deny가 맞다 — 철회 |

### 미적용
- R9 편집 후 eslint 훅: R8 운영 뒤 검토
- R12 AGENTS.md: Next 15라 보류
- R13 lessons 경로: 글로벌 소관 — 백엔드는 `docs/lessons.md`를 쓴다. 글로벌 rules 문구를 "프로젝트 `docs/lessons.md`"로 바꾸는 안을 사용자에게 제시

## 2026-10-07 — 패치 적용 · 재부팅 후 재검증

### 적용 경과
- 사용자가 이 세션에서 직접 "적용"을 선택했다(D-004의 확인 조건 충족).
- 1차 `git apply`(sandbox 안)는 `.claude/agents`·`commands`·`hooks`·`skills` 쓰기가 막혀(`Operation not permitted`) 중간에 실패했다. 이때 tracked 파일 9개가 unlink된 채로 남았다. 9개 모두 작업 전 미수정 상태였으므로 해당 경로만 지정해 `git checkout --`으로 HEAD에서 복구했다(`src/lib/auth.ts`는 건드리지 않음).
- 2차는 sandbox 밖에서 실행했고 권한 게이트를 거쳤다. `git apply --check` 후 `git apply` → rc=0.
- **교훈**: sandbox 쓰기 차단 경로가 섞인 패치는 `git apply`가 원자적으로 끝나지 않고 일부 파일을 지운 채 멈춘다. 이런 패치는 처음부터 sandbox 밖에서 `--check`와 함께 돌리거나, 차단 경로만 Edit/Write 도구로 적용한다.
- 직후 세션이 컴퓨터 재부팅으로 끊겼다. 이후 백엔드 메인 세션 요청으로 재개했다.

### 반영 확인 (디스크 기준)
`git status` 결과는 수정 13, 삭제 3, 신규 7(rules 6 + `review-front.md`)이고 이 폴더가 별도로 있다. 파일별 줄수는 "적용 패치 준비" 절의 표와 모두 일치한다(CLAUDE.md 57, rules 22/33/19/14/22/15, backend-researcher 87, review-front 38, review-flow 6, SKILL 35, 훅 163/121). `docs/assistant_workflow.md`는 없고 `UserAvatar.tsx:11`은 `rules/components.md`를 가리킨다. 누락이나 부분 반영은 없다.

### 재검증 (실제 레포)
| 항목 | 결과 |
|---|---|
| 훅 테스트 | `PASS=32 FAIL=0` |
| 백엔드 훅과 바이트 동일 | `cmp` 2개 OK |
| rules glob 매칭(`git ls-files -co`) | auth 1/1/3/1/1/1 · components 96/13 · services 4/1 · socket 1/1/3/1 · styles 6/1 · tests 1/0/1/1(`*.test.tsx` 0은 의도) |
| 이름 노출 | 0건. 이 WORKLOG 94행의 검사 명령 문구에 있던 개인 경로 조각을 플레이스홀더로 바꿨다(미커밋 초안) |
| 옛 이름 참조(`assistant_workflow`·`rules/ui.md`·`rules/nextauth`·`code-patterns`) | 0건(이 폴더 제외) |
| `bun run lint` | rc 0, 에러 0. 경고 4건은 모두 `TeamBoard.tsx`(이번 작업 비대상, 기존 경고) |
| `bun run typecheck` | rc 0 |
| R8 훅 명령 시험 | `git commit` 입력 → additionalContext 출력, `ls` → 무출력, rc 0 |

### 사용자 직접 적용 (재생성)
재부팅으로 scratchpad가 비어 diff 3종을 다시 만들었다(memory 39줄, settings-local 47줄, settings-json 19줄). 개인 경로가 들어 있어 이 폴더에는 두지 않고 bun 메인 세션 회신에 본문으로 첨부했다.

## 2026-10-08 — prompt-audit (내장 가이드 Step 0~7)

- **범위**: `CLAUDE.md`, `.claude/rules/*.md`(6개), `.claude/skills/bun/SKILL.md`, `.claude/agents/*.md`(2개), `.claude/commands/review-flow.md`. 합계 348줄.
- **제외**: `settings*.json`, 훅, `.mcp.json`(가이드상 읽지 않음). 사용자 레벨 설정은 지적만 했다.
- **대상 모델**: Opus 5.5(이 감사를 돌린 모델). `backend-researcher`는 `model: sonnet`으로 고정돼 있어 Sonnet 5.5 기준으로 봤다.
- **그룹별 결과**:
  - Group 1a(압박 언어): 0건. `CLAUDE.md:40`의 ⚠️는 이유가 붙은 환경 사실이라 유지했다.
  - Group 1c(과잉 명세): 4건.
  - Group 1d: 0건.
  - Group 2(설정 파일 결함): 2건.
  - Group 3: 해당 없음(agent description은 트리거 문구).
  - Group 4: 해당 없음(요청 코드 없음). 서브에이전트 목록은 글로벌과 겹치는 1건을 지적만 했다.
- 백엔드에서 나온 "`review` = 일반 정확성 리뷰" 오서술은 프론트에 없다(`review-flow.md`, `review-front.md`를 grep으로 확인).

| # | 위치 | 원문 | 패턴 | 확신도 | 조치 |
|---|---|---|---|---|---|
| A1 | `agents/backend-researcher.md:87` | "fillable 필드를 하나도 빠뜨리지 않도록 주의" | G2 낡은 사실. `fillable`은 이 백엔드에 없는 개념이다(`../bun/src` grep 0건) | High | rewrite: "DTO·Entity 필드는 하나도 빠뜨리지 않고 나열한다" |
| A2 | `agents/backend-researcher.md:50` | "room 구조 (`team-{teamId}`)" | G2 같은 파일 :18 "값을 복제하지 않는다"와 모순 | High | rewrite: 값 삭제 |
| A3 | `agents/backend-researcher.md:21-51` | "1단계~5단계" | G1c 판단 작업에 단계 순서를 강제 | Medium | rewrite: "분석 대상 (질문에 필요한 것만 본다)"와 종류별 소제목 |
| A4 | `agents/backend-researcher.md:60` | "다음 구조화된 형식으로 반환" + 고정 표 5개 | G1c 과잉 명세(질문과 무관하게 표 5개를 강제) | Medium | rewrite: "질문에 해당하는 표만" |
| A5 | `agents/backend-researcher.md:83-84` | "추론/추측 금지", "`@IsOptional()` 유무로 판단" | G1c 반복(:55·:56과 중복) | Medium | remove |
| A6 | `agents/review-front.md:9-23` | "절차 1.~5." | G1c 판단 작업의 단계 강제(앞뒤 순서가 의미 있는 것은 변경 파악뿐) | Medium | rewrite: "확인할 것" 목록 + 순서는 1줄 |
| A7 | `rules/components.md:10` | "React 훅은 조건부로 호출하지 않는다 (rules-of-hooks)" | G1c 학습된 기본값의 재진술. 이미 `eslint-config-next`가 강제한다 | Medium | remove |
| A8 | `rules/auth.md:11` | "`handler`에 전달 인자를 정확히 넘긴다" | 모호한 일반 덕목. 근거 사례가 없다 | Low | flag |

적용: A1~A7은 이 세션 사용자의 확인을 받아 적용했다(+19/−20줄, sandbox 밖에서 `git apply --check`를 먼저 돌린 뒤 적용). A8은 수정하지 않았다.
검증:
- 적용 후 `[0-9]단계`·`fillable`·`rules-of-hooks`·`team-{teamId}`가 agents/components에서 0건이다.
- 이름 노출 0건이다.
- frontmatter가 그대로 남았다.

**글로벌 관련 지적 (지적만 함, 수정 제안 없음 — 사용자 레벨 설정 담당 세션에 전달)**
- G-a: 글로벌 `CLAUDE.md`의 "Operating Principles (Non-Negotiable)" 제목. G1a 압박 표기로, 백엔드의 "(MUST OBEY)"와 같은 유형이다.
- G-b: 글로벌 `rules/workflow.md` §1 "비단순 작업(3단계 이상…)은 plan mode로 진입". G1b "plan before acting" 유형이다. 현재 모델은 지시 없이도 계획하므로 과잉 계획을 부를 수 있다.
- G-c: 글로벌 `rules/workflow.md:35-36,66`, `error-recovery.md:53`의 "lessons 파일"은 실체 경로가 없다(G2 깨진 참조, 기존 G1).
- G-d: 서브에이전트 목록 중복. 글로벌 `cross-project-researcher`와 프로젝트 `backend-researcher`가 둘 다 "연관 레포 스펙 조사"를 한다. 프로젝트 쪽은 NestJS 계약 대조에 특화돼 있다. 정리 여부는 사용자 판단이다.

## 2026-10-08 — 사용자 직접 적용분 확인

사용자가 백엔드 세션이 만든 스크립트로 R3·R8을 일괄 적용했다(R2는 앞서 적용). 디스크 실측 결과:
- `.claude/settings.json`: PreToolUse 항목 2개 중 "커밋 전 점검" 훅 1건. tracked 파일이라 `git status`에 `M`으로 잡힌다.
- `.claude/settings.local.json`: allow 12개. `FLUSHALL`·`docker exec`·`pnpm run`·`find:*`·`/Users/` 항목은 0건.

비밀값 노출을 피하려고 내용 출력 없이 개수만 셌다. 이제 남은 것은 커밋(사용자 지시 대기)과 별건 TODO(기존 `backdrop-blur` 3곳)뿐이다.

## 2026-10-08 — 커밋 전 독립 리뷰 (읽기 전용 서브에이전트)

결과: [차단] 0, [확인 필요] 3, [제안] 4. 원본으로 다시 확인한 뒤 판정했다.
| 지적 | 확인 결과 | 조치 |
|---|---|---|
| `services.md`의 `handleApiError`가 공용 패턴처럼 쓰임 | 사실이다. 파일마다 비공개 함수이고 `userService.ts:19`는 `(response, defaultMessage)`다 | 1줄 추가(사용자 확인) |
| `socket.md`의 `isSelfTriggered`가 유틸처럼 읽힘 | 사실이다. 훅 안의 지역 함수이고 `currentUserId`가 없으면 필터하지 않는다(`useTeamSocketEvents.ts:76-77`) | 문구 정정 |
| SKILL·services의 422 `VALIDATION_ERROR` 값 복제 | 백엔드와 일치한다(`../bun/src/common/dto/api-error.dto.ts:10-11`, `api-http.md:41`). 서로 맞는 중복이라 유지 | 없음 |
| `styles.md`의 `src/styles/**`가 죽은 glob | **오지적**. `src/styles/teams.ts`가 있다 | 없음 |
| `assistant_workflow.md` 삭제로 rules-of-hooks 미이관 | prompt-audit A7에서 의도적으로 뺐다(lint가 강제한다) | 커밋 본문에 명시 |
| `tests.md`의 vitest 설정 서술이 낡을 수 있음 | 현재는 정확하다 | 없음(설정 변경 시 함께 고친다) |
| `swagger_info.md`의 "기본 주소" 표현 | 사실이다. 코드 기본값은 `''`다(`FetchService.ts:328`) | 문구 정정 |

메인에서 직접 검사한 것:
- 훅 테스트 `PASS=32 FAIL=0`, 백엔드와 `cmp` 동일
- settings JSON 2개 유효
- glob 전부 매칭(`*.test.tsx` 0은 의도된 것)
- 이름·개인 경로·시크릿 0건
- CLAUDE.md 상태값 0건
- settings/hooks에 삭제된 파일 이름 참조 0건
- `bun run lint` 에러 0(경고 4건은 기존 `TeamBoard.tsx`)
- `bun run typecheck` rc 0

반영 후 lint와 훅 테스트를 다시 돌렸다.
