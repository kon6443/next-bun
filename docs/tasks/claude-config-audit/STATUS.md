# next-bun Claude 설정·문서 전수조사 + 비교 + 추천

- **상태**: 🟢 완료 — 설정 정비·prompt-audit·독립 리뷰 반영 후 커밋, `feat-onam → develop → main` PR 머지(사용자 확인). 커밋 해시·PR 번호는 git log·GitHub 참조 (2026-10-08)
- **브랜치**: `feat-onam` · **최종수정**: 2026-10-08
- **관련 문서**: DECISIONS.md · WORKLOG.md · 백엔드 공통(형제 훅·교차 로드) SSOT: `../bun/docs/tasks/tasks-claude-config.md`

## 목표 & 수용 기준
- 무엇을: next-bun의 `.claude/**`·`CLAUDE.md`·`README.md`·`docs/**` 전수조사, 글로벌·비교 레포 F(Next.js) 비교, 공식 문서 기반 추천안.
- 끝났다는 기준: 발견 표·추천안 표(Before/After/장점/단점/근거)·CLAUDE.md 상태성 문구 위치 목록이 WORKLOG 2026-10-07 절에 있고 bun-cc에 회신됨.
- 비목표: 커밋 (사용자 지시 후 별건). 메모리·`settings.json`·`settings.local.json`은 사용자가 직접 적용.

## 지금 어디까지
- 완료: 4개 조사(레포 인벤토리·글로벌 비교·비교 레포 F(Next.js) 비교·공식 문서) + 핵심 주장 원본 재확인 → WORKLOG 2026-10-07 절
- 완료: 적용 패치(R1~R8·R10·R11, rules 6분할, 훅 동기화) 준비·검증 → WORKLOG "적용 패치 준비" 절
- 완료: 사용자 확인 후 패치 적용 → 재부팅 뒤 실제 레포 재검증 통과 → WORKLOG "재부팅 후 재검증" 절
- 완료: prompt-audit 지적 7건 적용(사용자 확인), 1건 flag, 글로벌 지적 4건 → WORKLOG 2026-10-08 절
- 사용자가 R2(메모리)·R3(`settings.local.json`)·R8(`settings.json`)을 적용했다 — 디스크 확인: 커밋 전 점검 훅 1건, local allow 12개·위험 항목 0건
- **다음 할 일**:
  1. 별건 TODO: 기존 `backdrop-blur` 3곳 교체 (WORKLOG prompt-audit 표)

## 진행 체크리스트
- [x] S1 레포 인벤토리·문제 표
- [x] S2 글로벌 비교
- [x] S3 비교 레포 F(Next.js) 비교
- [x] S4 공식 문서·업계 패턴 → 추천안
- [x] S5 CLAUDE.md 상태성 문구 위치
- [x] S6 서브에이전트 보고값 원본 재확인 (WORKLOG "재확인" 표)
- [x] S7 적용 패치 준비·검증
- [x] S8 사용자 확인 후 적용·재검증
- [x] S9 사용자 직접 적용 3건
- [x] S10 prompt-audit
- [x] S11 독립 리뷰 반영 · 커밋 2개 · PR 머지 (`src/lib/auth.ts` 제외)

## 미해결 질문 · 차단
| # | 질문 | 누구에게 | 권장 디폴트 | 상태 |
|---|---|---|---|---|
| Q1 | 메모리(`~/.claude/projects/.../memory/`)는 sandbox상 쓰기 불가 — 사실 오류 2건 정정 + CLAUDE.md 중복 항목 삭제를 사용자가 직접 적용할까? | 사용자(bun-cc 경유) | 예. diff를 이쪽에서 만들어 제시 | 답변: 사용자 직접 적용 — diff 준비됨 |
| Q2 | `settings.local.json`(개인·gitignore) 위험 allow 정리 범위 | 사용자 | `redis-cli FLUSHALL`·`docker exec:*`·`xargs…redis-cli DEL`·`pnpm run:*`·일회성 절대경로 find/grep 제거 | 답변: 디폴트대로 — diff 준비됨 |

## 결정 요약 (본문은 DECISIONS.md)
- D-001 조사 단계에선 수정하지 않는다 — 결과는 이 폴더에만 기록
- D-002 서브에이전트 보고 중 원본과 어긋난 3건을 정정해 반영
- D-003 커밋 대상 문서·설정에 회사명·타 프로젝트명·개인 절대경로 금지 (비교 레포는 F/B 익명 표기)
- D-004 peer 승인 전달만으로 CLAUDE.md·`.claude/**`를 직접 고치지 않고 패치로 준비
- D-005 rules를 파일 종류별 6개로 분할

## 검증 명령 (DoD)
- `sh .claude/hooks/test-inject-sibling-claudemd.sh` (FAIL=0) · `cmp` 백엔드 훅 2개
- rules glob ↔ `git ls-files` 매칭 · 이름 노출 grep 0건 · 옛 이름(`ui.md`·`nextauth`·`assistant_workflow`·`code-patterns`) 참조 0건
- `bun run lint`(에러 0) · `bun run typecheck`

## 위험 & 롤백
- 설정·문서 정비 커밋 1개를 `git revert`하면 되돌아간다(태스크 기록 커밋과 분리돼 있다)
- `src/app/components/UserAvatar.tsx`(주석)가 포함돼 push하면 배포가 트리거된다 — 동작 변경은 없다
