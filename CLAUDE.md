# CLAUDE.md

Next.js 15 App Router + Bun 팀 협업/태스크 관리 웹앱.

## Commands
- `bun run dev` / `bun run build` / `bun run test` / `bun run lint`

## Conventions
- 한국어 UI (라벨, 에러 메시지, 토스트 모두 한국어)
- 날짜: UTC 저장, UTC 표시 (타임존 변환 절대 하지 않음)
- iOS Safari: `backdrop-filter:blur()` 사용 금지 → `box-shadow`로 대체
- glass-morphism: `bg-slate-800/50 border-slate-700/50`
- 태스크 상태 추가/변경 시 `src/app/config/taskStatusConfig.ts` 참조
- 역할 권한 변경 시 `src/app/config/roleConfig.ts` 참조
- API 함수 추가 시 `src/services/teamService.ts` 패턴 따르기 (ApiError + ErrorCode)
- 소켓 이벤트 추가 시 `src/types/socket.ts` 타입 먼저 정의
- 소켓 핸들러에서 self-event filtering 필수 (본인 이벤트는 HTTP 응답으로 이미 처리)
- 낙관적 업데이트: UI 먼저 반영, API 실패 시 롤백
