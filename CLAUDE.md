# CLAUDE.md

Next.js 15 App Router + Bun 팀 협업/태스크 관리 웹앱.

## Commands
- `bun run dev` / `bun run build` / `bun run test` / `bun run lint`

## Conventions
- 한국어 UI (라벨, 에러 메시지, 토스트 모두 한국어)
- 날짜: UTC 저장, 로컬 표시 (DB는 UTC, 브라우저에서 로컬 타임존으로 변환하여 표시)
- iOS Safari: `backdrop-filter:blur()` 사용 금지 → `box-shadow`로 대체
- glass-morphism: `bg-slate-800/50 border-slate-700/50`
- 태스크 상태 추가/변경 시 `src/app/config/taskStatusConfig.ts` 참조
- 역할 권한 변경 시 `src/app/config/roleConfig.ts` 참조
- API 함수 추가 시 `src/services/teamService.ts` 패턴 따르기 (ApiError + ErrorCode)
- 소켓 이벤트 추가 시 `src/types/socket.ts` 타입 먼저 정의
- 소켓 핸들러에서 self-event filtering 필수 (본인 이벤트는 HTTP 응답으로 이미 처리)
- 낙관적 업데이트: UI 먼저 반영, API 실패 시 롤백
- 확인 모달: 되돌리기 어려운 액션(연동 해제, 보관함 이동 등)에 `ConfirmModal` 사용. soft delete(댓글 삭제)는 모달 없이 바로 실행 + 토스트
- 검증 시 grep 전수 확인 필수: 변경된 함수/API 이름으로 프로젝트 전체 grep 후 호출 위치 전수 파악. 중복 API 호출, useEffect 간 중복 패턴 교차 비교
