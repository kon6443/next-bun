# CLAUDE.md

Next.js 15 App Router + Bun 팀 협업/태스크 관리 웹앱. 백엔드는 형제 레포 `../bun`(NestJS).

**문서 경계** — 같은 내용을 두 곳에 쓰지 않는다: `README.md` = 사실·사용법 · **이 문서** = 규약·금지·라우팅 · `docs/assistant_*.md` = 영역별 상세 규칙 · `docs/tasks/*.md` = 진행 상황·결정 근거.

## 자동 라우팅 표

요청이 아래에 해당하면 **작업 시작 전에** 해당 문서를 Read한다. 둘 이상이면 모두 읽는다. (면제: 한 줄 수정·단순 조회)

| 트리거 | 읽을 파일 |
|---|---|
| UI·컴포넌트·스타일·모바일 반응형·iOS Safari·애니메이션 | `docs/assistant_rules_ui.md` |
| 로그인·NextAuth·세션·카카오 | `docs/assistant_rules_nextauth.md` + `../bun/docs/tasks/tasks-kakao-login-latency.md`(지연 조사 — "카카오 탓" 결론은 부분 정정됐다) |
| 성능·지연·병목 진단 | `docs/assistant_rules_diagnostics.md` |
| 반복 작업 절차(질문 → 실행 → 린트·빌드) | `docs/assistant_workflow.md` |
| 백엔드 API·DTO·소켓 이벤트 계약 대조 | 아래 "백엔드 레포" 절 · 조사는 `backend-researcher` 에이전트 |
| Swagger·백엔드 주소 | `docs/swagger_info.md` |

## 작업 경계

### Never
| 금지 | 이유 |
|---|---|
| `bun run test` 실행 | watch 모드(`vitest`)라 끝나지 않는다 — 1회 실행은 **`bun run test:run`** |
| 백엔드 DB 명령(`db:migrate:*`·`sqlplus`) | LOCAL과 PROD가 같은 DB — 실행이 곧 상용 적용. `.claude/settings.json`에서도 deny |
| `backdrop-filter: blur()` | iOS Safari 성능 문제 → `box-shadow`로 대체 |
| 시크릿(`.env`·토큰)을 코드·로그·응답·문서에 기입 | 커밋 이력에 영구 보존된다 |
| 사용자 지시 없는 `git commit`·`push` | `main` push가 곧 배포다(`.github/workflows/oci_build_and_deploy_next.yml` — `docs/**`·`*.md`만 바꾼 push는 제외) |

### Ask — 실행 전 승인
커밋·푸시·머지 · `docker`·`ssh` · 파일 삭제 · 새 의존성 추가 · 백엔드 API 계약에 영향을 주는 변경(백엔드 쪽 대응 필요 여부까지 알린다)

## Commands
- 개발 `bun run dev` · 빌드 `bun run build` · 린트 `bun run lint` · 테스트 **`bun run test:run`** · 타입 `bun run typecheck` · 통합 **`bun run ci:core`**
- ⚠️ Claude Code sandbox 안에서는 `build`가 Google Fonts(`next/font`) 차단으로 실패하거나 멈춘다 — 코드 문제가 아니다. sandbox 밖에서 판정한다

## 백엔드 레포 (`../bun`)
- `../bun` 파일을 건드리면 PreToolUse 훅(`.claude/hooks/inject-sibling-claudemd.sh`)이 백엔드 규약을 자동 주입한다. 백엔드 `CLAUDE.md`는 주입 상한(약 9천 자)을 넘으므로 "지금 Read하라"는 지시가 온다 — 백엔드 파일을 다루기 전에 따른다.
- 백엔드 DB 명령(`db:migrate:*`·`sqlplus`)은 이 레포 `.claude/settings.json`에서도 deny다 — LOCAL과 PROD가 같은 DB라 실행이 곧 상용 적용이다.
- Claude 설정·훅·교차 로드 작업 이력은 `../bun/docs/tasks/tasks-claude-config.md`가 SSOT다.

## Conventions
- 한국어 UI (라벨, 에러 메시지, 토스트 모두 한국어)
- 날짜: UTC 저장, 로컬 표시 (DB는 UTC, 브라우저에서 로컬 타임존으로 변환하여 표시)
- glass-morphism: `bg-slate-800/50 border-slate-700/50`
- 태스크 상태 추가/변경 시 `src/app/config/taskStatusConfig.ts` 참조
- 역할 권한 변경 시 `src/app/config/roleConfig.ts` 참조
- API 함수 추가 시 `src/services/teamService.ts` 패턴 따르기 (ApiError + ErrorCode)
- 소켓 이벤트 추가 시 `src/types/socket.ts` 타입 먼저 정의
- 소켓 핸들러에서 self-event filtering 필수 (본인 이벤트는 HTTP 응답으로 이미 처리)
- 낙관적 업데이트: UI 먼저 반영, API 실패 시 롤백
- 확인 모달: 되돌리기 어려운 액션(연동 해제, 보관함 이동 등)에 `ConfirmModal` 사용. soft delete(댓글 삭제)는 모달 없이 바로 실행 + 토스트

## Definition of Done (이 레포)
글로벌 DoD에 더해:
1. **`bun run lint` 에러 0** · 테스트가 있는 영역을 바꿨으면 **`bun run test:run` 통과** · 영향이 크거나 배포 이슈가 의심되면 **`bun run build` 통과**
2. **변경 심볼 grep 전수 확인** — 변경한 함수·API 이름으로 프로젝트 전체를 grep해 호출 위치를 전부 파악한다. 중복 API 호출, useEffect 간 중복 패턴을 교차 비교한다
3. 로그인이 필요해 검증하지 못한 화면·경로는 **"미검증"으로 명시** — 빌드 통과를 동작 검증으로 포장하지 않는다
4. **Verification Story 1~2줄**
