# Fishing 멀티플레이어 구현 태스크

## 개요
/fishing 페이지에 실시간 멀티플레이어 기능 추가.
기존 팀 소켓 `/teams` namespace 패턴을 그대로 따르되, `/fishing` namespace를 별도로 생성.

## 범위 (이번 작업) — 구현 완료
- [x] 백엔드 패턴 학습
- [x] 실시간 채팅
- [x] 온라인 접속자 수 / 유저 목록
- [x] 다른 유저 캐릭터 표시 (위치 동기화 + 보간)
- [x] 낚시 상태 브로드캐스트 (다른 유저가 낚시 중인 것 표시)
- [x] 낚시 성공 알림 ("OO님이 용왕잉어를 잡았습니다!")

## 범위 외 (추후)
- 인벤토리 DB 저장
- 리더보드
- 교환/선물

## 2번 확인사항: 기존 기능 영향 없음
- `/fishing` namespace는 `/teams`와 완전히 독립
- FishingModule은 TeamModule과 의존성 없음
- Redis 키 prefix: `fishing:*` (team 키와 충돌 없음)
- fishing 코드에 에러가 나도 team 기능은 정상 동작

---

## 백엔드 태스크 (NestJS)

### BE-1: fishing.events.ts
- 이벤트 상수 (FishingSocketEvents)
- 페이로드 인터페이스 (위치, 채팅, 낚시 상태, 접속 등)
- 경로: `src/modules/fishing/fishing.events.ts`

### BE-2: fishing-online.service.ts
- Redis 온라인 유저 관리 (OnlineUserService 패턴 복제)
- Redis 키: `fishing:socket:{socketId}`, `fishing:map:{mapId}:online`, `fishing:map:{mapId}:user:{userId}:sockets`
- 위치 데이터 저장: `fishing:map:{mapId}:positions` (Hash: userId → JSON position)
- 경로: `src/modules/fishing/fishing-online.service.ts`

### BE-3: fishing.gateway.dto.ts
- JoinMapDto, LeaveMapDto, MoveDto, FishingStateDto, ChatMessageDto
- 경로: `src/modules/fishing/fishing.gateway.dto.ts`

### BE-4: fishing.gateway.ts
- namespace: `/fishing`
- Room: `fishing-map-{mapId}`
- 이벤트 핸들러: joinMap, leaveMap, move, fishingState, chatMessage, catchResult
- 위치 broadcast는 room 전체에 emit (본인 제외)
- 경로: `src/modules/fishing/fishing.gateway.ts`

### BE-5: fishing.module.ts + 등록
- FishingModule 생성
- app.module.ts에 import 추가
- main.ts에 FishingOnlineService Redis 주입 추가

### BE-6: 빌드 검증
- `pnpm run build` 통과 확인

---

## 프론트엔드 태스크 (Next.js)

### FE-1: fishingSocket.ts 타입 정의
- FishingSocketEvents 상수 (백엔드와 동일)
- ServerToClientEvents, ClientToServerEvents 인터페이스
- 페이로드 타입
- 경로: `src/types/fishingSocket.ts`

### FE-2: FishingSocketContext.tsx
- TeamSocketContext.tsx 패턴 복제
- 디바운스 연결, closeOnBeforeunload, isConnectingRef 가드
- mapId 기반 room 참가
- 경로: `src/app/fishing/contexts/FishingSocketContext.tsx`

### FE-3: useFishingSocketEvents.ts
- useTeamSocketEvents.ts 패턴 복제
- ref 기반 핸들러, self-event 필터링
- 경로: `src/app/fishing/hooks/useFishingSocketEvents.ts`

### FE-4: 다른 유저 렌더링
- 위치 emit (throttle ~100ms, 변경 시에만)
- 다른 유저 위치 수신 + 선형 보간(lerp)
- 캔버스에 다른 유저 그리기 (다른 색상, 이름표)
- 낚시 상태 표시 (낚싯대, 찌)

### FE-5: ChatPanel 소켓 연결
- 기존 ChatPanel stub에 실제 소켓 연동
- 메시지 송수신

### FE-6: 온라인 유저 수 + 낚시 알림
- HUD에 온라인 유저 수 표시
- 다른 유저 낚시 성공 시 토스트/채팅 메시지

### FE-7: layout.tsx 수정
- FishingSocketProvider로 래핑

### FE-8: 빌드 검증
- `bun run build` 통과 확인

---

## 설계 결정

### Room 구조
- 현재 맵이 1개(RIVER_MAP)이므로 mapId = 'river' 고정
- Room 이름: `fishing-map-river`
- 추후 맵 추가 시 확장 가능

### 위치 동기화 전략
- 클라이언트: 이동 시 throttle(100ms)로 position emit
- 서버: room broadcast (본인 제외)
- 수신 클라이언트: 선형 보간(lerp)으로 부드러운 이동
- 서버는 위치를 Redis에 저장 (새 접속자에게 현재 위치 전달용)

### 인증
- 기존 WsJwtGuard 재사용
- 인증 실패 시 fishing namespace 접속 거부

### Redis 키 prefix
- `fishing:` prefix로 team 키와 완전 분리
