---
name: bun
description: 백엔드 레포(../bun, NestJS) API·DTO·에러 코드·소켓 이벤트를 확인하거나, 백엔드 응답에 맞춰 프론트를 설계·수정할 때 사용한다. 파일을 열기 전 계획 단계에서도 먼저 부른다. 백엔드 규약 로드 절차와 프론트↔백엔드 계약 접점을 안내한다.
---

<!-- paths frontmatter 를 일부러 쓰지 않는다: 스킬 paths 도 이 레포 루트 기준 glob 이라
     ../bun/** 를 매칭하지 못한다. 넣으면 자동 발동이 영구히 죽는다. -->

# 백엔드(`../bun`) 작업 절차

## 1. 규약 먼저 로드
- `../bun` 파일을 건드리면 훅이 백엔드 규약을 주입하지만, 계획 단계라면 훅이 아직 발동하지 않았다. 그러니 지금 읽는다:
  ```
  Read ../bun/CLAUDE.md
  ```
- 코드 규약 상세: `../bun/.claude/rules/*.md`(파일 종류별) — 백엔드 `.ts`를 건드리면 주입되지만, 설계 단계에선 아래 표의 rule만 직접 읽는다.

## 2. 계약 접점 (값의 SSOT는 백엔드 rule — 여기는 요지와 위치만)

| 접점 | 요지 | SSOT (`../bun/.claude/rules/`) |
|---|---|---|
| 성공 응답 | `{ code: 'SUCCESS', data, message }` — 전역 인터셉터 없음 | `api-http.md` |
| 에러 응답 | `{ code, message, timestamp }` (+ `details` 있을 때만). **`statusCode` 필드 없음** — HTTP 상태와 `code`로 분기 | `api-http.md` |
| 입력 검증 | `forbidNonWhitelisted: true` — **DTO에 없는 필드를 보내면 422 `VALIDATION_ERROR`**. 요청 바디에 여분 필드를 싣지 않는다 | `api-http.md` |
| 인증 | HTTP: cookie `access_token` → Bearer / WS: `handshake.auth.token` → Bearer. 인가(팀 멤버십·역할)는 서버가 검증 | `api-http.md` |
| 소켓 | namespace `/teams`·`/fishing`, room `team-{teamId}` | `realtime-ws.md` |
| 날짜 | UTC 저장 → 프론트가 표시 시점에 로컬 변환 | `datetime.md` |

프론트 쪽 대응 위치: API 호출 `src/services/teamService.ts`(ApiError + ErrorCode) · 소켓 타입 `src/types/socket.ts` · 인증 `src/lib/auth.ts`.

## 3. 수정 범위
- 이 세션의 주 레포는 **프론트**다. 백엔드 파일 수정은 사용자가 명시적으로 요청했을 때만.
- 백엔드는 **별도 git 레포**다 — 커밋도 따로 한다.
- 프론트만 고쳐 해결되는지, 백엔드 응답을 고쳐야 하는지 먼저 판정해 사용자에게 알린다.
- 조사가 여러 파일에 걸치면 `backend-researcher` 에이전트에 맡긴다.
