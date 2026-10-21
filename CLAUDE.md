# CLAUDE.md

Next.js App Router 팀 협업/태스크 관리 웹앱. 백엔드는 형제 레포 `../bun`(NestJS)이고 그 레포 세션이 맡는다(아래 "세션 운영"). 런타임·버전 등 사실은 `README.md`.

**문서 경계** — 같은 내용을 두 곳에 쓰지 않는다: `README.md` = 사실·사용법 · **이 문서** = 규약·금지·라우팅 · `.claude/rules/*.md` = 파일 종류별 규칙(자동 로드) · `docs/*.md` = 경로로 표현 못 하는 절차·진단·참고 정보 · `docs/tasks/` = 진행 상황·결정 근거.

## 세션 운영 — 백·프 2세션 체제 (상시 적용, 사용자가 따로 말하지 않아도)
- **사용자와 직접 소통하지 않는다.** 사용자는 백엔드 레포(`../bun`) 세션(메인)과만 소통하고, 이 세션은 메인의 지시로 일한다. 보고·질문·결정 요청은 지시를 보낸 메인 세션에 `SendMessage`(받은 메시지의 `from` 주소)로 보낸다. 사용자 결정이 필요하면 권장 디폴트와 함께 메인에 올린다 — 이 문서의 "승인·확인"은 모두 메인을 거친 사용자 승인이다.
- **이 세션의 몫**: 프론트 작업·코드 읽기·조사·리뷰 루프. **백엔드 소스는 읽지도 고치지도 않는다** — API·소켓 계약은 메인에 질의한다(답은 `파일:라인 + 인용`, 정확성은 답한 세션 책임). 예외로 로컬 백엔드가 떠 있으면 Swagger JSON(주소는 `docs/swagger_info.md`)만 직접 확인할 수 있다.
  - 메인이 이 세션에 질의하면 답도 `파일:라인 + 인용`으로 한다.
  - 권한 프롬프트(ask 규칙·허용되지 않은 명령 모두)는 메인을 거쳐 승인된 작업을 실행할 때만 띄운다 — 프롬프트가 이 세션 창에 뜨면 사용자가 여기서 승인해야 하니 메인에 미리 알린다.
  - 질의에는 무엇을(엔드포인트·이벤트·필드·에러 코드) · 왜(어느 화면·파일이 쓰는지) · 기대 답 형식을 적는다.
- **태스크 문서(SSOT)는 메인이 작성·관리한다**(어느 레포에 있든). 이 세션은 지시에 적힌 경로를 읽기만 하고, 남길 내용은 보고에 담는다.
- 메인 지시 없이 사용자가 이 세션에 직접 요청하면, 백엔드(메인) 세션을 통해 요청해 달라고 안내한다.

## 자동 로드되는 것 (읽으라고 지시하지 않는다)
- `.claude/rules/*.md` — 컴포넌트·스타일·API 서비스·소켓·인증·테스트 규칙. 각 파일의 `paths`에 맞는 파일을 읽거나 고치는 순간 로드된다. 파일을 열기 전 설계 단계라면 해당 규칙 파일을 직접 Read한다

## 문서 라우팅 — 자동 로드되지 않는 문서

요청이 아래에 해당하면 **작업 시작 전에** 해당 문서를 Read한다. 경로로 조건을 걸 수 없는 문서만 둔다. (면제: 한 줄 수정·단순 조회)

| 트리거 | 읽을 파일 |
|---|---|
| 성능·지연·병목 진단 | `docs/assistant_rules_diagnostics.md` |
| 카카오 로그인 지연 | `docs/tasks/kakao-login-latency-front.md`(프론트 측 기록 — 현재 결론은 메인에 질의) |
| Swagger·백엔드 주소 | `docs/swagger_info.md` |
| 변경 코드 리뷰 | `/review-flow` → `review-front` 에이전트 |

## 작업 경계

### Never
| 금지 | 이유 |
|---|---|
| `pnpm test` 실행 | watch 모드(`vitest`)라 끝나지 않는다 — 1회 실행은 **`pnpm test:run`** |
| 백엔드 DB 명령(`db:migrate:*`·`sqlplus`) | LOCAL과 PROD가 같은 DB — 실행이 곧 상용 적용. `.claude/settings.json`에서도 deny |
| 새 코드에 `backdrop-filter: blur()`·`backdrop-blur-*` | iOS Safari 성능 문제 → `box-shadow`·반투명 배경으로 대체 |
| 시크릿(`.env`·토큰)을 코드·로그·응답·문서에 기입 | 커밋 이력에 영구 보존된다 |
| 사용자 지시 없는 `git commit`·`push` | `main` push가 곧 배포다 (배포 조건은 `README.md` "배포") |

### Ask — 실행 전 승인 (메인을 거친 사용자 승인 — 위 "세션 운영")
머지·리베이스·태그 · 원격 접속(`ssh`·`scp`·`redis-cli`)과 원격·운영 `docker` · 로컬 `docker`는 조회(`ps`·`images`·`logs`·`inspect`·`version`·`info`·`compose ps/logs`)만 확인 없이 — `run`·`exec`·`rm`·`build`·`compose up/down/build`와 `-c`/`--context`·`-H`가 붙거나 `DOCKER_HOST`/`DOCKER_CONTEXT`를 지정한 명령은 확인 · 파일 삭제 · 새 의존성 추가 · 백엔드 API 계약에 영향을 주는 변경(백엔드 쪽 대응 필요 여부까지 알린다). 커밋·푸시는 메인이 사용자 승인을 명시해 지시했을 때만(위 Never). 일부는 `.claude/settings.json`이 ask로 강제한다

## Commands
- 패키지 매니저는 **pnpm**(버전은 `package.json` `packageManager`). 의존성 변경은 `pnpm add`·`pnpm install`로 하고 `pnpm-lock.yaml`을 같이 커밋한다
- 의존성의 설치 스크립트(postinstall 등)는 pnpm 기본값대로 차단된다. 스크립트 없이 동작을 확인한 패키지는 `package.json` `pnpm.ignoredBuiltDependencies`에, 꼭 실행해야 하는 패키지만 근거와 함께 `pnpm.onlyBuiltDependencies`에 둔다
- 자주 쓰는 것: 개발 `pnpm dev` · 린트 `pnpm lint` · 테스트 **`pnpm test:run`** · 타입 `pnpm typecheck` · 통합 **`pnpm ci:core`** — 전체 목록·설명은 `README.md`가 SSOT
- ⚠️ Claude Code sandbox 안에서는 `build`가 Google Fonts(`next/font`) 차단으로 실패하거나 멈춘다 — 코드 문제가 아니다. sandbox 밖에서 판정한다

## Conventions
- 한국어 UI (라벨, 에러 메시지, 토스트 모두 한국어)
- 날짜: UTC 저장, 로컬 표시 — 변환은 `src/app/utils/dateUtils.ts`
- 태스크 상태 추가/변경 시 `src/app/config/taskStatusConfig.ts` 참조
- 역할 권한 변경 시 `src/app/config/roleConfig.ts` 참조
- API 호출은 `src/services/`, 소켓 타입은 `src/types/socket.ts` — 세부 규칙은 해당 파일을 열면 자동 로드된다

## Definition of Done (이 레포)
글로벌 DoD에 더해:
1. **`pnpm lint` 에러 0** · **`pnpm typecheck` 통과** · 테스트가 있는 영역을 바꿨으면 **`pnpm test:run` 통과** · 영향이 크거나 배포 이슈가 의심되면 **`pnpm build` 통과**(sandbox 밖에서 판정 — 머지 전 최종 판정은 메인)
2. **변경 심볼 grep 전수 확인** — 변경한 함수·API 이름으로 프로젝트 전체를 grep해 호출 위치를 전부 파악한다. 중복 API 호출, useEffect 간 중복 패턴을 교차 비교한다
3. 로그인이 필요해 검증하지 못한 화면·경로는 **"미검증"으로 명시** — 빌드 통과를 동작 검증으로 포장하지 않는다
4. **Verification Story 1~2줄**
