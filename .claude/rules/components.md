---
paths:
  - "src/**/*.tsx"
  - "src/app/hooks/**"
---

# 컴포넌트·훅 규칙

## 상태와 액션
- **낙관적 업데이트**: UI를 먼저 반영하고, API가 실패하면 이전 상태로 롤백한다.
- **확인 모달**: 되돌리기 어려운 액션(연동 해제, 보관함 이동 등)에는 `ConfirmModal`(`src/app/components/ConfirmModal.tsx`)을 쓴다. soft delete(댓글 삭제)는 모달 없이 바로 실행하고 토스트로 알린다.

## 스타일 토큰
- glass-morphism 카드: `bg-slate-800/50 border-slate-700/50`
- blur 대신 반투명 배경(`bg-slate-900/80`)과 `box-shadow`로 깊이를 낸다 (금지 자체는 `CLAUDE.md` Never)

## 모바일
- 여백은 모바일을 데스크톱보다 크게 잡는다 — 예: `grid gap-5 sm:gap-4 sm:grid-cols-2`
- 크기는 고정 `px` 대신 `clamp()`·`min()`·`vw`를 쓴다 — 예: `width: clamp(140px, 45vw, 200px)`
- 버튼·입력 필드의 터치 영역은 최소 44px 높이를 확보한다
- 모바일 뷰포트(375px~)에서 확인한다
- **네이티브 form 요소**(`input[type=date|time|number]`, `select`)에는 `max-w-full box-border appearance-none`을 항상 넣는다. iOS Safari에서는 이 요소들이 고유 최소 너비를 가져 `w-full`만으로는 부모를 뚫고 넘친다. wrapper의 `overflow-hidden`을 빼기 전에 자식의 intrinsic width를 확인한다. iOS Safari CSS 변경은 실기기로 확인하기 전까지 미확정으로 보고한다

## 로딩 컴포넌트
`src/app/teams/components/LoadingSpinner.tsx`에 있고 `@/app/teams/components`에서 import한다.

| 컴포넌트 | 용도 |
|---|---|
| `LoadingSpinner` | 페이지 레벨 로딩 (컨테이너와 메시지 포함) |
| `LoadingSpinnerSimple` | 컨테이너 없는 간단한 로딩 |
| `ButtonSpinner` | 버튼 안 인라인 로딩 (`border-current`로 색 상속) |
| `BarLoader` | 바형 게이지 (로그인 오버레이에서 사용) |
