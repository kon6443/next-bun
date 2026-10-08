---
paths:
  - "src/types/socket.ts"
  - "src/types/fishingSocket.ts"
  - "src/app/**/contexts/*Socket*.tsx"
  - "src/app/hooks/useTeamSocketEvents.ts"
---

# 소켓 규칙

- 이벤트를 추가할 때는 타입을 먼저 정의한다. 이벤트 이름은 `TeamSocketEvents`에, 페이로드 interface는 `src/types/socket.ts`에 둔다(낚시는 `fishingSocket.ts`). 핸들러는 그다음에 쓴다.
- **본인 이벤트는 무시한다(self-event filtering).** 본인 액션의 결과는 HTTP 응답으로 이미 반영됐다. 핸들러 첫 줄에서 `isSelfTriggered(payload.<createdBy|updatedBy|deletedBy|userId>)`이면 return한다. `isSelfTriggered`는 `useTeamSocketEvents.ts` 훅 안의 지역 함수이고, 현재 사용자 ID가 없으면 필터하지 않는다.
- 소켓 수신으로 상태를 갱신할 때 같은 변경에 토스트를 중복으로 띄우지 않는다.
- namespace·room 구조의 값은 백엔드가 SSOT다(스킬 `bun`의 계약 접점 표).
