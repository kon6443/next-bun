# 카카오 로그인 성능 이슈

## 개요
카카오 로그인 시 간헐적으로 매우 오래 걸리는 현상 (200ms ~ 9,500ms)

## 상태
- **발견일**: 2026-01-27
- **현재 상태**: 미해결 (카카오 서버 측 문제로 제어 불가)
- **적용된 조치**: 로딩 UX 개선

---

## 문제 분석

### 증상
- 카카오 로그인 시 응답 시간이 불안정
- 빠를 때: 200~400ms
- 느릴 때: 3,000~9,500ms
- 특별한 패턴 없이 랜덤하게 발생

### 로그인 플로우 및 측정 결과

```
[사용자] → [Next.js 앱] → [카카오 OAuth] → [NextAuth 콜백] → [백엔드 API] → [로그인 완료]
```

| 구간 | 평균 시간 | 비고 |
|------|----------|------|
| NextAuth → 카카오 token endpoint | **불안정** | 200ms ~ 9,000ms |
| NextAuth → 카카오 userinfo endpoint | **불안정** | 카카오 서버 응답 의존 |
| 백엔드 API (postKakaoSignInUp) | **150~200ms** | 안정적, 빠름 |
| - 카카오 access_token_info API | 40~70ms | |
| - DB 쿼리 (getUserBy) | 50~100ms | |
| - JWT 토큰 생성 | 1~2ms | |

### 병목 지점
**NextAuth가 카카오 서버에 요청하는 부분**이 병목
- `https://kauth.kakao.com/oauth/token` (token exchange)
- `https://kapi.kakao.com/v2/user/me` (userinfo)

---

## 원인

### 확인된 원인
- **카카오 서버 응답 시간 불안정**: 제어 불가능한 외부 요인
- 네트워크 경로, 카카오 서버 부하 등에 따라 달라짐

### 배제된 원인
- ❌ 우리 백엔드 문제 (항상 150~200ms로 안정적)
- ❌ Cold Start 문제 (패턴과 맞지 않음)
- ❌ 연속 로그인 문제 (패턴과 맞지 않음)
- ❌ DB 연결 문제 (쿼리 시간 안정적)

---

## 시도한 해결책

### 1. 300ms 인위적 대기 제거 ✅
- 위치: `signin/page.tsx`의 `handleKakaoLogin`
- 결과: 300ms 절약됨 (체감 효과 미미)

### 2. NextAuth httpOptions timeout 증가 ✅
- 위치: `auth.ts`의 KakaoProvider
- 설정: `timeout: 10000` (10초)
- 결과: 타임아웃 방지용, 속도 개선 아님

---

## 고려한 대안들

### 옵션 1: 카카오 JavaScript SDK 사용
- 클라이언트 사이드에서 직접 카카오 로그인
- NextAuth의 CredentialsProvider와 함께 사용
- **장점**: 서버 사이드 token exchange 제거
- **단점**: 구조 변경 필요, 카카오 서버 문제는 여전히 존재 가능

### 옵션 2: 현상 유지 + UX 개선 ✅ (선택됨)
- 로딩 바/스피너로 대기 시간 체감 개선
- **장점**: 구조 변경 없음
- **단점**: 실제 속도 개선 아님

### 옵션 3: NextAuth userinfo 호출 최적화
- 카카오 token 응답에 사용자 정보 없어서 불가

---

## 관련 파일

### 프론트엔드 (next-bun)
- `src/lib/auth.ts` - NextAuth 설정
- `src/app/auth/signin/page.tsx` - 로그인 페이지
- `src/services/authService.ts` - 백엔드 API 호출

### 백엔드 (bun)
- `src/modules/auth/auth.controller.ts` - API 엔드포인트
- `src/modules/auth/auth.service.ts` - 로그인 로직

---

## 디버깅 방법

### 터미널 로그 확인
Next.js 서버 터미널에서 callback 처리 시간 확인:
```
GET /api/auth/callback/kakao?code=... 302 in XXXXms
```

### NextAuth 디버그 모드
`auth.ts`에서 debug 활성화:
```typescript
debug: true, // 또는 process.env.NODE_ENV === "development"
```

### 브라우저 Network 탭
카카오 관련 요청 시간 확인:
- `kauth.kakao.com/oauth/authorize`
- `kauth.kakao.com/oauth/token`
- `kapi.kakao.com/v2/user/me`

---

## 향후 작업

- [ ] 카카오 SDK 방식 검토 (성능 차이 확인)
- [ ] 카카오 개발자 센터에서 앱 설정 확인
- [ ] 카카오 서버 상태 모니터링 추가 고려

---

## 참고 링크

- [NextAuth KakaoProvider](https://next-auth.js.org/providers/kakao)
- [카카오 로그인 문서](https://developers.kakao.com/docs/latest/ko/kakaologin/common)
- [카카오 JavaScript SDK](https://developers.kakao.com/docs/latest/ko/javascript/getting-started)
