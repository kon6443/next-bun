---
paths:
  - "src/services/**"
  - "src/types/api.ts"
---

# API 서비스 규칙

## 함수 형태 (`src/services/teamService.ts` 패턴)
- 호출은 `fetchServiceInstance.backendFetch({ method, endpoint, accessToken, body })`로 한다.
- `!response.ok`이면 `await handleApiError(response, { <상태코드>: '<한국어 메시지>', default: '<한국어 메시지>' })`를 호출한다.
  - 실패 처리 본체는 `src/services/apiError.ts`의 `throwApiError` 하나다. 서비스 파일의 `handleApiError`는 그 파일의 `ERROR_RULES`를 넘기는 얇은 래퍼이고, 호출 모양은 파일마다 그대로다(`userService.ts`만 `(response, defaultMessage)`로 문자열 하나).
  - 백엔드 응답에 `code`가 있으면 그 코드로 `ApiError`를 던진다.
  - `code`가 없으면 `ERROR_RULES.statusCodes`(`statusCodeMap(...)` — 기본 400·401·403·404·500에 더할 상태만 고른다)의 코드와, 서버 `message` → 상태별 문구 → `default` 순서의 메시지로 던진다. 표에 없는 상태는 `UNKNOWN_ERROR`다.
  - 서비스마다 다른 규칙(상태 코드 표, `textBodyAsMessage`·`statusInFallback` — 지금은 팀 API만 켬)은 화면 문구·code를 유지하려고 옮긴 차이다. 바꾸면 그 서비스의 문구·`error.code` 분기가 바뀌니 `apiError.test.ts`의 서비스별 표를 함께 고친다.
  - 새 서비스 파일은 같은 모양(`ERROR_RULES` + 래퍼)으로 만들고, 실패 처리 함수를 새로 쓰지 않는다. 요청 시간 상한은 `apiError.ts`의 `timeoutSignal(ms)`을 쓴다.
- 에러 타입은 `ApiError`·`ErrorCode`·`createApiError`(`src/types/api.ts`)를 쓴다. 호출부는 `error.code`로 분기한다.

## 백엔드 계약
- 요청 바디에는 백엔드 DTO에 있는 필드만 싣는다. 여분 필드가 있으면 백엔드가 검증 오류(`VALIDATION_ERROR`)로 거부한다.
- 응답·에러 구조와 인증 방식의 값은 백엔드가 SSOT다. 확인이 필요하면 메인에 질의한다(`CLAUDE.md` "세션 운영").
- 백엔드 계약(필드·상태코드·에러코드)을 바꿔야 하면 실행 전에 메인을 거쳐 승인을 받는다 (`CLAUDE.md` Ask).
