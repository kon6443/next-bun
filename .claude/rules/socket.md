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
  - **예외 — 팀 태그 이벤트 4종(`tagCreated`·`tagUpdated`·`tagDeleted`·`tagsReordered`)은 본인 것도 적용한다.** 같은 사용자의 다른 탭이 태그를 모르면 태스크 폼이 그 태그를 떼어 저장한다. 반영이 멱등이라 안전하다. 새 이벤트에 예외를 넓히려면 같은 근거(멱등 + 다른 탭 불일치가 실제 피해로 이어짐)가 있어야 한다.
- 소켓 수신으로 상태를 갱신할 때 같은 변경에 토스트를 중복으로 띄우지 않는다.
- namespace·room 구조의 값은 백엔드가 SSOT다. 확인이 필요하면 메인에 질의한다(`CLAUDE.md` "세션 운영").
