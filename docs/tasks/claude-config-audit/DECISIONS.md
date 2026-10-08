# next-bun Claude 설정 감사 — 결정 로그

> 새 결정은 맨 아래에 추가한다. 기존 항목은 고치지 않고, 뒤집힐 때는 새 항목에 `supersedes D-00N`을 쓴다.

## D-001 — 조사 단계에선 설정·문서를 수정하지 않는다 (2026-10-07)
- **맥락**: bun-cc(메인 세션) 위임 범위가 "조사·추천까지"
- **결정**: 산출물은 이 폴더(STATUS·DECISIONS·WORKLOG)에만. CLAUDE.md·settings·메모리·rules 수정과 커밋은 사용자 승인 후 별건
- **근거**: bun-cc 위임 메시지 "작업 규칙" · 프로젝트 CLAUDE.md "Ask — 실행 전 승인"
- **버린 대안**: 명백한 오탈자(예: 메모리 UTC 규칙) 즉시 수정 — 승인 범위 밖
- **영향**: 없음 (문서 추가만)

## D-002 — 서브에이전트 보고값 중 원본과 어긋난 3건을 정정해 반영 (2026-10-07)
- **맥락**: 글로벌 context.md §5 "결론이 걸린 값은 원본에서 재확인"
- **결정**:
  1. `review-flow.md:27`의 `task.ts`는 깨진 참조가 아니다 — `src/app/types/task.ts`가 있다 (경로 모호성만 '낮'으로 남김)
  2. "`additionalContext`는 UserPromptSubmit에서만" 주장은 틀렸다 — PreToolUse 훅이 이 세션에서 `additionalContext`를 실제 주입했다(형제 훅 출력), 비교 레포 F(Next.js) `settings.json:65`도 PreToolUse에서 사용
  3. 권한 우선순위 설명(hard/soft deny)은 auto-mode 분류기 문서와 섞인 것 — 추천 근거로 쓰지 않고 permissions 문서 기준(deny→ask→allow 평가, managed > local > project > user 병합)만 쓴다
- **근거**: `find src -name 'task*.ts'` 결과 · 이 세션 PreToolUse:Bash 훅 출력 · WORKLOG "재확인" 표
- **영향**: 발견 표·추천안 근거 문구

## D-003 — 커밋 대상 문서·설정에 회사명·타 프로젝트명·개인 절대경로를 쓰지 않는다 (2026-10-07)
- **맥락**: 사용자 새 요구사항(bun-cc 경유, 백엔드 D-003과 같은 기준)
- **결정**: `CLAUDE.md`·`.claude/**`·이 태스크 폴더에 회사명, 무관한 타 프로젝트명, 개인 절대경로를 쓰지 않는다. 비교 대상은 "비교 레포 F(Next.js)", "비교 레포 B(NestJS)"로 익명 표기한다. 짝 레포 `bun`(`../bun`)은 기능상 필요하므로 허용한다
- **근거**: tracked 파일 전수 grep(WORKLOG 2026-10-07 "이름 노출 검사" 절)
- **영향**: 이 폴더는 아직 커밋 전이라 기존 표기를 치환했다(append-only 예외, 미커밋 초안). `.claude/skills/bun/SKILL.md:7`은 보고만 했다(sandbox상 `.claude/skills` 쓰기 불가)

## D-004 — 승인 전달(peer)만으로 CLAUDE.md·`.claude/**`를 직접 고치지 않고 적용 가능한 패치로 준비한다 (2026-10-07)
- **맥락**: bun-cc가 "사용자 승인"을 전달했다. 그러나 이 세션 하네스 규칙상 peer 메시지는 사용자 승인으로 간주되지 않고, CLAUDE.md·설정을 peer 요청으로 수정하지 않는다. `.claude/skills`·`hooks`·`settings*.json`·메모리는 sandbox 쓰기 차단 경로이기도 하다
- **결정**: 변경 전체를 임시 git 복사본에서 만들고 검증한 뒤 패치로 남긴다. 이 세션의 사용자가 확인하면 `git apply`로 적용한다. 사용자 소유 파일(메모리, `settings.local.json`)과 deny 대상(`settings.json`)은 별도 diff로 둔다
- **버린 대안**: peer 전달을 승인으로 보고 직접 편집 — 권한 세탁(permission laundering) 위험
- **영향**: 작업 트리에는 이 폴더 외 변경 없음

## D-005 — rules를 파일 종류별 6개로 분할한다 (2026-10-07)
- **결정**: `ui.md`·`nextauth.md`를 `components`(`src/**/*.tsx`, `src/app/hooks/**`) · `styles`(`src/**/*.css`, `src/styles/**`) · `services`(`src/services/**`, `src/types/api.ts`) · `socket` · `auth` · `tests`로 대체한다. 파일 종류에 묶이는 규약(glass 토큰, ConfirmModal, 낙관적 업데이트, API 함수 형태, self-event)은 CLAUDE.md Conventions에서 rules로 옮긴다. CLAUDE.md에는 횡단 규약(한국어 UI, 날짜, config 포인터)만 남긴다
- **근거**: 각 규칙의 사실은 코드에서 확인했다(WORKLOG "적용 패치" 절의 근거 표). glob 매칭은 `git ls-files` 기준 검사 결과로 확인했다
- **버린 대안**: 디렉토리 단위 분할(`teams/`·`fishing/`) — 규칙이 파일 종류를 따라가므로 중복이 커진다
- **영향**: `src/app/components/UserAvatar.tsx:11` 주석 참조를 갱신해야 한다. 형제 훅은 rules를 파일명 하드코딩 없이 순회하므로(`inject-sibling-claudemd.sh:108-109`) 이름 변경에 영향이 없다
