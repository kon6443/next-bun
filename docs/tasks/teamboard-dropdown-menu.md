# TeamBoard 헤더 드롭다운 메뉴

## 목표
TeamBoard 헤더의 IconButton 4개를 정리하여 모바일에서 정보 밀도를 낮추고 터치 사용성을 개선한다.

## 현재 상태
`src/app/teams/[teamId]/TeamBoard.tsx:808-835`

4개 IconButton이 수평 나열:
1. **+ 새 카드 작성** → `href="/teams/${teamId}/tasks/new"` (항상 노출, outlined)
2. **팀 초대** → `onClick: setShowInviteModal(true)` (canManageInvites일 때만, outlined)
3. **팀 수정** → `href="/teams/${teamId}/edit"` (항상 노출, outlined)
4. **사용 가이드** → `onClick: setShowTutorial(true)` (항상 노출, ghost)

### 관련 상태 변수 위치 (검증됨)
- `canManageInvites`: `TeamBoard.tsx:87` — `useState(false)`, 권한 검사로 설정
- `setShowInviteModal`: `TeamBoard.tsx:141` — `useTeamInvite` 훅의 반환값 `setShowModal`
- `setShowTutorial`: `TeamBoard.tsx:105` — `useState(false)`
- `teamId`: `TeamBoardProps`에서 `string`으로 전달

## 문제
- 모바일(393px)에서 4개 아이콘 + 팀 이름이 한 줄에 밀집
- 팀 이름이 길면 아이콘이 축소되거나 겹침
- 자주 쓰는 기능(태스크 생성)과 가끔 쓰는 기능(가이드)이 동일 비중

## 구현 계획

### 변경 방향
- 자주 사용: **+ 새 카드 작성** → 그대로 노출
- 가끔 사용: **팀 초대, 팀 수정, 사용 가이드** → "더보기(⋯)" 드롭다운으로 통합

### 재사용 가능한 기존 코드 (검증됨)
- **`useClickOutside` 훅** (`src/app/hooks/useClickOutside.ts`) — 외부 클릭 감지. `mousedown` + `touchstart` 모두 지원. 그대로 재사용
- **`StatusDropdown` 패턴** (`src/app/components/StatusDropdown.tsx`) — 열기/닫기, 방향 계산, Escape 닫기, 키보드 네비게이션 패턴 참고. 단, StatusDropdown은 태스크 상태 전용이라 직접 재사용 불가
- **`IconButton` 컴포넌트** — `icon`, `label`, `variant`, `href`/`onClick` props. 아이콘 크기 `w-5 h-5`, 버튼 `rounded-full p-2`

### 필요한 작업

#### 1. DropdownMenu 컴포넌트 생성
- **위치**: `src/app/teams/[teamId]/components/DropdownMenu.tsx`
- **'use client'** 필수 (useState, useRef, useEffect 사용)

```tsx
type DropdownMenuItem = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
  href?: string;
  show?: boolean;  // false이면 렌더링 안 함 (기본값 true)
};

type DropdownMenuProps = {
  items: DropdownMenuItem[];
};
```

- **기능**:
  - 트리거: "⋯" 아이콘 버튼 (IconButton의 ghost variant 스타일 재사용)
  - 열기/닫기: `useState(false)`
  - 외부 클릭 닫기: `useClickOutside` 훅 재사용
  - Escape 키 닫기: `useEffect` + `keydown` 리스너
  - 아이템 클릭 시: `onClick` 실행 또는 `href` 네비게이션 → 메뉴 닫기
  - `show === false`인 아이템은 렌더링하지 않음

- **스타일**:
  ```
  메뉴 컨테이너: absolute right-0 top-full mt-2
                 bg-slate-900 border border-white/10 rounded-xl
                 shadow-xl shadow-black/20 z-50
                 min-w-[160px]
  메뉴 아이템:   flex items-center gap-3 px-4 py-3
                 text-sm text-slate-300
                 hover:bg-white/5 hover:text-white
                 transition-colors
  구분선 없음 (아이템 3개뿐이라 불필요)
  ```

- **위치 계산**: StatusDropdown처럼 상하 방향 계산은 **불필요** — 헤더 상단에 위치하므로 항상 아래로 열림 (`top-full`)

#### 2. TeamBoard 헤더 수정
`src/app/teams/[teamId]/TeamBoard.tsx:808-835`

```tsx
// Before (라인 808-835)
<div className="flex items-center gap-1 shrink-0">
  <IconButton icon={PlusIcon} label="새 카드 작성" variant="outlined" href={`/teams/${teamId}/tasks/new`} />
  {canManageInvites && (
    <IconButton icon={UserGroupIcon} label="팀 초대" variant="outlined" onClick={() => setShowInviteModal(true)} />
  )}
  <IconButton icon={EditIcon} label="팀 수정" variant="outlined" href={`/teams/${teamId}/edit`} />
  <IconButton icon={QuestionMarkIcon} label="사용 가이드" variant="ghost" onClick={() => setShowTutorial(true)} />
</div>

// After
<div className="flex items-center gap-1 shrink-0">
  <IconButton icon={PlusIcon} label="새 카드 작성" variant="outlined" href={`/teams/${teamId}/tasks/new`} />
  <DropdownMenu items={[
    { label: '팀 초대', icon: UserGroupIcon, onClick: () => setShowInviteModal(true), show: canManageInvites },
    { label: '팀 수정', icon: EditIcon, href: `/teams/${teamId}/edit` },
    { label: '사용 가이드', icon: QuestionMarkIcon, onClick: () => setShowTutorial(true) },
  ]} />
</div>
```

#### 3. import 추가
- TeamBoard.tsx에서 `DropdownMenu` import
- DropdownMenu.tsx에서 `useClickOutside` import (`@/app/hooks`)
- DropdownMenu.tsx에서 `Link` import (`next/link`) — href 아이템용

## 리스크 및 위험성

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 드롭다운이 `cardStyles.section`의 `overflow` 설정에 의해 잘림 | 높음 | `z-50` + 부모 섹션에 `overflow-hidden` 없는지 확인 필요. 현재 섹션은 `overflow` 미설정이므로 안전 |
| `canManageInvites`가 false일 때 드롭다운 아이템이 2개만 됨 | 낮음 | `show` prop으로 필터링. 아이템 수가 줄어도 레이아웃 문제 없음 |
| 모바일에서 드롭다운이 화면 오른쪽 밖으로 나감 | 중간 | `right-0`으로 오른쪽 정렬하면 트리거 버튼 기준 왼쪽으로 열리므로 안전 |
| 기존 IconButton과 시각적 일관성 | 낮음 | 트리거 버튼을 `IconButton` ghost variant 스타일로 맞춤 |
| 터치 후 드롭다운 닫기 타이밍 | 중간 | `useClickOutside`가 `touchstart` 지원 확인됨. 아이템 클릭 시 `onClick` 실행 후 `setIsOpen(false)` 순서 보장 |
| 드롭다운 열린 상태에서 스크롤 | 낮음 | 헤더가 상단 고정이 아니므로 스크롤 시 자연스럽게 함께 이동. 별도 처리 불필요 |

## 사전 확인 완료 사항
- [x] `useClickOutside` 훅 존재 및 터치 지원 확인 (`src/app/hooks/useClickOutside.ts`)
- [x] `StatusDropdown`에서 Escape 닫기 패턴 확인
- [x] `IconButton` props 및 스타일 확인 (ghost: `text-slate-400 hover:text-white hover:bg-white/10`)
- [x] `canManageInvites` 출처 확인 (useState, 권한 검사로 설정)
- [x] `setShowInviteModal`, `setShowTutorial` 상태 변수 위치 확인
- [x] TeamBoard 헤더 섹션에 `overflow-hidden` 없음 확인 → 드롭다운 잘림 위험 없음
- [x] `teamId`는 `TeamBoardProps`에서 string으로 전달됨

## 참고 파일
| 파일 | 역할 | 변경 여부 |
|------|------|-----------|
| `src/app/teams/[teamId]/TeamBoard.tsx:808-835` | 현재 헤더 | **변경** (IconButton 4개 → 1개 + DropdownMenu) |
| `src/app/teams/[teamId]/components/DropdownMenu.tsx` | 신규 컴포넌트 | **신규 생성** |
| `src/app/hooks/useClickOutside.ts` | 외부 클릭 감지 훅 | 참고 (재사용) |
| `src/app/components/StatusDropdown.tsx` | 기존 드롭다운 패턴 | 참고 (패턴만 참고) |
| `src/app/teams/components/index.ts` | IconButton 정의 | 참고 |

## 완료 기준 (DoD) ✅ 전체 완료
- [x] DropdownMenu 컴포넌트 생성
- [x] TeamBoard 헤더에 적용 (4개 → 1개 + 드롭다운)
- [x] 외부 클릭(터치 포함) 닫기 동작
- [x] Escape 키 닫기 동작
- [x] `canManageInvites=false`일 때 "팀 초대" 미노출 확인
- [x] 드롭다운 메뉴가 화면 밖으로 안 넘어가는지 확인
- [x] 모바일(393px) + 데스크탑(1280px) 확인
- [x] `bun run build` 성공
- [x] iOS Safari 실기기 확인
