---
paths:
  - "src/**/*.css"
  - "src/styles/**"
---

# 스타일(CSS·스타일 상수) 규칙

## blur 대체 패턴
금지 자체는 `CLAUDE.md` Never가 정본이다. 깊이감은 아래처럼 낸다.

```css
.card {
  background: rgba(15, 23, 42, 0.85);          /* 반투명 배경 */
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);  /* 깊이감 */
}
```

## 애니메이션
- `transform`·`opacity`만 애니메이션한다 (GPU 가속). `width`·`height` 직접 애니메이션은 reflow를 일으킨다
- 모바일에서는 복잡한 애니메이션을 줄인다
- 공용 keyframes는 `src/app/globals.css`에 둔다 (예: `barLoader` → `.animate-barLoader`). 컴포넌트 전용 애니메이션은 `*.module.css`에 둔다
