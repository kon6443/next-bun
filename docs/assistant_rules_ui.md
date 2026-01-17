## UI/UX 개발 규칙

이 문서는 UI/UX 관련 이슈 해결 경험을 바탕으로 정리한 규칙입니다.
동일한 문제가 반복되지 않도록 새로운 기능 개발 시 참고합니다.

---

### 1. 모바일 반응형 UI 규칙

#### 문제 사례
- 날짜/시간 입력 필드가 상위 요소와 시각적으로 붙어보임
- 애니메이션 컴포넌트 크기가 모바일에서 너무 작거나 비율이 맞지 않음
- 터치 영역이 좁아 사용성 저하

#### 해결 원칙
- **여백**: 모바일에서는 `gap`, `space-y` 등의 여백을 데스크톱보다 크게 설정
  ```tsx
  // 예시: 모바일에서 gap-5, 데스크톱에서 gap-4
  <div className="grid gap-5 sm:gap-4 sm:grid-cols-2">
  ```
- **반응형 크기**: 고정 크기(`px`) 대신 `clamp()`, `min()`, `vw` 단위 활용
  ```css
  /* 예시: 최소 140px, 뷰포트 기준 45%, 최대 200px */
  width: clamp(140px, 45vw, 200px);
  height: clamp(160px, 40vw, 200px);
  ```
- **테스트**: 반드시 모바일 뷰포트(375px~)에서 테스트
- **터치 영역**: 버튼/입력 필드는 최소 44px 높이 확보

---

### 2. Safari/iOS 성능 규칙

#### 문제 사례
- `backdrop-filter: blur()` 사용 시 iOS Safari에서 심각한 성능 저하
- 페이지 로딩이 수십 초까지 지연되는 현상
- 스크롤 버벅임, 애니메이션 프레임 드롭

#### 해결 원칙
- **backdrop-blur 주의**: 사용 전 반드시 iOS 실기기에서 테스트
- **대안 사용**:
  - 반투명 배경색: `bg-slate-900/80` (opacity 활용)
  - `box-shadow`로 깊이감 표현
  - 그라데이션 배경 사용
- **필수 사용 시**:
  - `will-change: transform` 추가
  - 블러 강도 최소화 (`blur(4px)` 이하)
  - 블러 적용 영역 최소화

```css
/* 피해야 할 패턴 */
.card {
  backdrop-filter: blur(20px);  /* iOS에서 성능 저하 */
}

/* 권장 패턴 */
.card {
  background: rgba(15, 23, 42, 0.85);  /* 반투명 배경 */
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}
```

---

### 3. OAuth 로그인 UX 규칙

#### 문제 사례
- 카카오 로그인 버튼 클릭 후 즉시 리다이렉트되어 로딩 UI가 보이지 않음
- 진짜 오래 걸리는 구간은 콜백 처리 중 (JWT 콜백에서 백엔드 API 호출)
- 사용자가 로그인 진행 상황을 알 수 없어 혼란

#### 해결 원칙
- **콜백 상태 감지**: OAuth 콜백 URL의 `code` 파라미터로 처리 중 상태 감지
  ```tsx
  const code = searchParams.get("code");
  const isProcessingCallback = !!code;
  const showLoading = isLoading || isProcessingCallback;
  ```
- **로딩 UI**: 콜백 처리 중일 때 전체 화면 로딩 UI 표시
- **시각적 피드백**: 로딩 컴포넌트는 명확하게 (바형 게이지, 프로그레스 등)

---

### 4. 공통 컴포넌트 활용

프로젝트 내 로딩 컴포넌트 (`src/app/teams/components/LoadingSpinner.tsx`):

| 컴포넌트 | 용도 | 특징 |
|---------|------|------|
| `LoadingSpinner` | 페이지 레벨 로딩 | 대시 보더 컨테이너 포함, 메시지 표시 |
| `LoadingSpinnerSimple` | 간단한 로딩 | 컨테이너 없음, 메시지 옵션 |
| `ButtonSpinner` | 버튼 내 인라인 | 작은 크기, `border-current`로 색상 상속 |
| `BarLoader` | 세련된 로딩 UX | 바형 게이지 애니메이션, 카카오 로그인에 적합 |

#### 사용 예시
```tsx
import { LoadingSpinner, BarLoader } from "@/app/teams/components";

// 페이지 로딩
<LoadingSpinner message="데이터를 불러오는 중..." />

// OAuth 로그인 로딩
<BarLoader barCount={5} barHeight="32px" />
```

---

### 5. CSS 애니메이션 규칙

#### 커스텀 애니메이션
`globals.css`에 정의된 애니메이션:

```css
/* 바형 게이지 로딩 애니메이션 */
@keyframes barLoader {
  0%, 100% { transform: scaleY(0.4); opacity: 0.4; }
  50% { transform: scaleY(1); opacity: 1; }
}
.animate-barLoader {
  animation: barLoader 1s ease-in-out infinite;
}
```

#### 성능 고려사항
- `transform`, `opacity` 애니메이션 선호 (GPU 가속)
- `width`, `height` 직접 애니메이션은 피함 (reflow 발생)
- 모바일에서 복잡한 애니메이션은 간소화

---

### 체크리스트

새로운 UI 기능 개발 시 확인:

- [ ] 모바일 뷰포트(375px)에서 여백/크기 확인
- [ ] iOS Safari 실기기에서 성능 테스트
- [ ] `backdrop-blur` 사용 여부 확인
- [ ] 로딩 상태에 적절한 피드백 제공
- [ ] 터치 영역 44px 이상 확보
