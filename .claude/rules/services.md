---
paths:
  - "src/services/**"
  - "src/types/api.ts"
---

# API 서비스 규칙

## 함수 형태 (`src/services/teamService.ts` 패턴)
- 호출은 `fetchServiceInstance.backendFetch({ method, endpoint, accessToken, body })`로 한다.
- `!response.ok`이면 `await handleApiError(response, { <상태코드>: '<한국어 메시지>', default: '<한국어 메시지>' })`를 호출한다.
  - `handleApiError`는 서비스 파일마다 따로 둔 비공개 함수다. `userService.ts`의 것은 `(response, defaultMessage)`로 메시지 문자열 하나만 받는다. 고치는 파일에 이미 있는 시그니처를 따른다.
  - 백엔드 응답에 `code`가 있으면 그 코드로 `ApiError`를 던진다.
  - `code`가 없으면 상태코드 기반 코드와 위 폴백 메시지로 던진다.
- 에러 타입은 `ApiError`·`ErrorCode`·`createApiError`(`src/types/api.ts`)를 쓴다. 호출부는 `error.code`로 분기한다.

## 백엔드 계약
- 요청 바디에는 DTO에 있는 필드만 싣는다. 여분 필드가 있으면 백엔드가 422 `VALIDATION_ERROR`로 거부한다.
- 응답·에러 구조와 인증 방식의 값은 백엔드가 SSOT다. 스킬 `bun`의 계약 접점 표를 따른다.
- 백엔드 계약(필드·상태코드·에러코드)을 바꿔야 하면 실행 전에 승인을 받는다 (`CLAUDE.md` Ask).
