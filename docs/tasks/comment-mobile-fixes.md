# 모바일 댓글 버그 수정

## 버그 1: 댓글창 터치 시 화면 확대 ✅ 수정 완료

### 원인
- iOS Safari는 font-size 16px 미만인 input/textarea 포커스 시 자동 줌
- 댓글 작성 textarea: `text-sm`(14px) — `TaskDetailPage.tsx:629`
- 댓글 수정 textarea: `text-sm`(14px) — `TaskDetailPage.tsx:659`

### 수정
- 두 textarea 모두 `text-sm` → `text-base`(16px) 변경 완료
- `bun run build` 성공

---

## 버그 2: 댓글 시간 9시간 차이 — 전수조사 완료

### 조사 범위
- 백엔드: 엔티티, 서비스, 컨트롤러, 소켓 이벤트, DB 설정, 알림 시스템
- 프론트: 포맷 함수, Date 변환, 소켓 핸들러, HTTP 응답 처리

### 조사 결과

**프론트엔드: 댓글과 태스크 시간 처리 완전 동일**
- 둘 다 `formatCompactDateTime()` 사용 (getUTCHours, getUTCMinutes)
- 둘 다 `new Date(string)` 변환
- 코드상 차이 없음

**백엔드: 엔티티 PK 방식 차이 발견**
- TeamTask: `@PrimaryGeneratedColumn` → save() 후 DB 값 자동 재조회
- TaskComment: `@PrimaryColumn` → save() 후 crtdAt이 undefined 가능
- 소켓 이벤트에 `crtdAt?.toISOString() ?? new Date().toISOString()` fallback 존재
- 단, fetchTaskDetail re-fetch로 즉시 보정됨

**환경 차이**
- 프로덕션: `TZ=UTC` 명시 설정
- 로컬 개발: TZ 미설정 (OS 기본 = KST)

### 결론
코드 전수조사 결과, 프론트/백 모두 댓글과 태스크의 시간 처리는 동일.
9시간 차이는 UTC 표시 컨벤션에 의한 정상 동작일 가능성 높음.
실제 확인 필요: 브라우저 네트워크 탭에서 API 응답의 crtdAt 값 비교.

---

## 완료 기준 (DoD)
- [x] 버그 1: 모바일 댓글창 터치 시 화면 확대 안 됨 — `text-base` 적용
- [x] 버그 1: `bun run build` 성공
- [ ] 버그 1: iOS Safari 실기기 확인
- [ ] 버그 2: 실제 API 응답 값 확인 후 판단
