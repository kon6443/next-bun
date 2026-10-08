## 백엔드/Swagger 주소

이 문서는 백엔드와 Swagger 주소를 한 곳에서 관리하기 위한 안내입니다.
주소가 바뀌면 이 문서의 값만 수정하면 됩니다.

### 현재 주소
- 프론트가 호출하는 백엔드 주소: 환경 변수 `NEXT_PUBLIC_API` (`src/services/FetchService.ts`)
- LOCAL 개발 시 백엔드 주소: `http://localhost:3500` (코드 기본값이 아니라 `NEXT_PUBLIC_API`에 넣는 값이다. 미설정 시 빈 문자열)
- Swagger 주소: `http://localhost:3500/api/v1/docs` (LOCAL 전용)
