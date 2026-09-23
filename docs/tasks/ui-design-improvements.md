# UI/UX 디자인 디테일 개선

## 목표
전체 페이지에 걸친 디자인 일관성, 터치 사용성, 접근성을 개선한다.
모바일 우선(iPhone 15 Pro Safari 393px 기준), 다크테마 앱.

## 디자인 디테일 개선

### P0: 높은 우선순위 ✅ 전체 완료

- [x] **CTA 버튼 색상 통일** — `bg-blue-600` → `bg-sky-600`
- [x] **h1 크기 퍼블릭 페이지 간 통일** — 최상위 `text-3xl sm:text-4xl`, 하위 `text-2xl sm:text-3xl`
- [x] **마이페이지 비표준 크기 → Tailwind 표준화** — `text-[0.72rem]` → `text-xs`, `text-[2.15rem]` → 표준 클래스
- [x] **에러 메시지 가시성 강화** — bg/border 추가, errorBoxStyle 불투명도 상향

### P1: 중간 우선순위 ✅ 전체 완료

- [x] **터치 타겟 크기 보강** — TaskCard `p-2` → `p-2.5`, InventoryPanel 닫기 `h-9 w-9`, 시간측정 `py-2.5`
- [x] **섹션 여백 퍼블릭 페이지 간 통일** — guide `mb-12`, fishId `mb-10`
- [x] **팀 카드 호버 피드백 강화** — `hover:bg-slate-900/80` 추가
- [x] **TeamsLanding 기능 카드 호버 추가** — `hover:border-sky-500/30 transition-colors`
- [x] **인벤토리 빈 상태 개선** — 아이콘 + 안내 텍스트 추가
- [x] **disabled 상태 커서 추가** — baseInputStyles에 `disabled:cursor-not-allowed`

### P2: 낮은 우선순위 ✅ 전체 완료

- [x] **마이페이지 그라디언트 단순화** — `bg-slate-900/85` 단색
- [x] **BottomNavBar 그림자** — 이미 단일 그림자, 추가 작업 불필요
- [x] **보조 텍스트 색상 대비 개선** — 보조 텍스트 `text-slate-500` → `text-slate-400` (23개 파일, 인터랙티브/placeholder 제외)
- [x] **포커스 링 추가** — `focus-visible:ring-2 focus-visible:ring-sky-500/50`
- [x] **반응형 하단 여백** — `pb-24` → `pb-16 sm:pb-24`

## UX 개선

### 완료

- [x] **TeamBoard 헤더 드롭다운** — 별도 태스크(`teamboard-dropdown-menu.md`)로 완료
- [x] **TaskDetailPage 댓글 메타 정보 정리** — `flex-wrap` 추가
- [x] **TaskForm 버튼 순서 변경** — `flex-col-reverse` → `flex-col` (취소→수정 표준 순서)

### 미완료

- [ ] **홈페이지 CTA 차별화** — 세션 기반 분기 필요. 별도 태스크 권장
- [ ] **about 페이지 뒤로가기 추가** — "지금 낚시하러 가기" CTA가 이미 존재. 우선순위 낮음

## 완료 기준 (DoD)
- [x] `bun run build` 성공
- [ ] 모바일(393px) + 데스크탑(1280px) 실기기 확인
- [ ] iOS Safari 실기기 확인 (터치 타겟, 호버 피드백)
