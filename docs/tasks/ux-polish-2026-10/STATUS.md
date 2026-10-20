# UX 개선 묶음 — 태그 활용 · 오류/빈 상태 · 접근성 (2026-10)

- **상태**: 🟢 구현·리뷰 루프(3R, 확정 결함 0)·최종 검토·브라우저 검증 12/12 완료 — 사용자 지시로 커밋·`feat-onam-ux-polish → develop → main` 머지 (2026-10-20). 머지·배포 결과는 GitHub PR·Actions가 기록(`gh pr list --state merged --head feat-onam-ux-polish`)
- **브랜치**: `feat-onam-ux-polish` (`origin/develop` `6c5291f`) · worktree `next-bun/.claude/worktrees/ux-polish`
- **세션**: 메인 `bun-f5`(문서·검증·사용자 소통) / 구현 `next-bun-6c`. 프론트 전용 — 백엔드 변경 없음
- **배경**: 팀 태그 배포 후 개선 후보 조사(메인 + next-bun-6c, 근거 재확인). 사용자 선택: 묶음 ①②③ 적용, 운영 정리(더미 스케줄러 등)는 의도된 동작이라 제외

## 범위 & 수용 기준
### ① 태그 활용 마무리
- 카드·리스트·상세의 태그 칩을 누르면 보드 필터가 그 태그로 설정된다(키보드로도 가능, 버튼 시맨틱). 근거: `TagChip.tsx:40` 칩이 span/li뿐
- 보드 검색이 태그 이름도 찾는다. 근거: `taskUtils.ts:171-178` 제목·설명만 검색
- 필터 패널을 접어도 선택된 태그가 칩으로 보이고 개별 해제할 수 있다. 근거: `TaskFilters.tsx` 활성 필터 수만 표시
### ② 오류 · 빈 상태
- 보드 태스크 조회 실패 시 빈 칸반 대신 오류 상태 + "다시 시도"가 보인다(재시도 시 재조회). 근거: `TeamBoard.tsx:1017` ErrorAlert만, 빈 칸반이 그대로 렌더
- 팀 목록 조회 실패 시 "다시 시도". 근거: `TeamsClient.tsx:87` 문구만 (`teams/error.tsx`에는 있음 — 일관성)
- 칸반·리스트·간트 빈 상태에 "새 카드 작성" 행동 버튼. 근거: `EmptyState` action prop 미사용(`Kanban.tsx:242`, `ListView.tsx:166`, `GanttChart.tsx:272`)
### ③ 접근성 · 가독성 · lint
- 채팅 패널·튜토리얼 모달: `useDialog`(포커스 이동·트랩·복귀·Esc), 닫기 버튼 터치 영역 44px 이상. 근거: `TeamChatPanel.tsx:171-178`, `TutorialGuide.tsx:90-103`
- 9~10px 글자를 최소 11~12px로. 근거: `ListView.tsx:192·208`, `TaskFilters` 섹션 라벨
- `TeamBoard.tsx` 기존 lint 경고 4건 → 0 (동작 불변). 근거: `:803` teamId/teamIdNum, `:901·918` removeTaskFromLocal, `:559` 의도적 제외는 사유 주석

### 공통
- `pnpm lint` 에러·경고 0(TeamBoard 경고 해소 후 기준) · `pnpm typecheck` · `pnpm test:run` 통과 · `pnpm build` ✅ · 변경 동작마다 테스트(유틸·훅 위주, 기존 관례)
- 비목표: 칸반 카드 드래그(별건), 코드 분리(별건), 백엔드 변경

## 진행 체크리스트
- [x] F1 — ① 태그 활용 (칩 버튼·`?tag=` 상세→보드·태그명 검색·접힌 패널 칩)
- [x] F2 — ② 오류·빈 상태 (보드 오류 섹션+재조회, 팀 목록 재시도, 빈 상태 "새 카드 작성")
- [x] F3 — ③ 접근성·가독성·lint (채팅·튜토리얼 useDialog·44px, 11~12px, TeamBoard 경고 4→0)
- [x] F3a — 오류 박스에 브라우저 원문 "Failed to fetch" 노출 → `errorUtils.extractErrorMessage`에서 fetch TypeError를 "네트워크 연결을 확인해주세요."로 (팀 목록·보드·기존 호출처 공통)
- [x] F4 — 검증(메인): ESLint 경고 0 · typecheck 0 · test:run 336/336 · build ✅ · Playwright 8/8(카드 칩 필터·접힌 칩 해제·태그명 검색·상세 칩→`?tag=`·보드 오류 복구·팀 목록 오류 한국어 문구+복구·채팅 Esc·닫기 44px·375px). 빈 상태 "새 카드 작성"은 단위 테스트만
  - 주의: dev 서버가 떠 있는 worktree에서 `pnpm build`를 돌리면 `.next`가 덮여 dev가 500(ENOENT `_buildManifest`) — build는 dev를 끈 뒤 또는 별도 디렉토리에서
- [ ] F5 — 리뷰 루프(사용자 지시: Opus 5.5 리뷰어 2 — 프로젝트 `review-front` 정의 + 글로벌 `/review`, 교차검증, 확정 결함 0까지 반복). 백엔드는 이번 작업 변경 0건이라 대상 없음
  - 1R: 머지 차단 없음. 교차검증 확정 C1 medium(튜토리얼 자동 표시가 채팅 위·아래 중첩 — 이번 useDialog 적용의 회귀) · C2 low(일반 TypeError도 네트워크 문구) · C3 low(토큰 없음에 무의미한 다시 시도) · C5 nit(재입장 성공 후에도 오류 섹션) · C6 nit(빈 칼럼·필터 0건에도 "새 카드 작성"). C4는 nit로 하향 → U-005. 수정 지시(next-bun-6c)
  - 1R 조치(next-bun-6c): C1 `shouldAutoShowTutorial`(채팅 열림 시 보류) · C2 `NetworkError`(FetchService가 fetch 실패만 변환, AbortError 통과, 일반 TypeError는 원문, TagModal 지역 변환 제거) · C3 `BoardLoadError`(토큰 없음 → 로그인 버튼, 그 외 다시 시도) · C4 `?tag=` 진입 시 스크롤 복원 생략 · C5 재입장 시 오류면 전체 재조회 · C6 활성 필터면 "필터 초기화", 칸반은 첫 칼럼만. typecheck 0 · ESLint 0/0 · test:run 342/342(+6) · 뮤테이션 4종 확인. C4·C5는 화면 검증 대상
  - **2R부터 리뷰 루프는 next-bun-6c가 직접 수행**(사용자 교정 2026-10-20: "프론트 프젝 리뷰는 프론트 세션이"). 1R은 메인이 돌렸음. 메인은 라운드 보고 수신·STATUS 갱신·최종 검증 담당
  - 2R(next-bun-6c): 머지 차단 없음. 확정 A low(튜토리얼 자동 표시가 채팅 외 대화상자 — 태그·온라인·초대·역할 — 위에도 뜸, C1 계열 회귀 → `isOtherDialogOpen`으로 일반화) · C low(리스트·간트 빈 상태 CTA가 가로 스크롤 영역 안이라 375px에서 화면 밖 → 0건이면 표·차트 대신 스크롤 영역 밖 EmptyState) · B nit(숫자 아닌 팀 ID는 재시도 대신 "팀 목록으로"). typecheck 0 · ESLint 0/0 · test:run 344/344(+2) · 뮤테이션 3종 확인. 한계: TeamBoard의 `isOtherDialogOpen` 조합식 자체는 단위 테스트 없음(조건 함수만)
  - 3R(next-bun-6c): 리뷰어 2 모두 **확정 결함 0** → 루프 종료. 공통 nit 1건 즉시 수정(튜토리얼 보류 조건에 텔레그램·디스코드 연동 해제 확인 모달 추가). 최종 typecheck 0 · ESLint 0/0 · test:run 344/344
- [x] F6 — 최종 검토(메인, 2026-10-20): 변경분 잔여물(console.log·TODO·any·ts-ignore·eslint-disable·backdrop-blur) 0 · `pnpm ci:core`(dev 끄고) lint 0/0 · typecheck 0 · 344/344 · build ✅. 브라우저(Playwright, 실제 백엔드·Oracle) **12/12**: API 스모크(팀·태스크·태그 200) · 카드 칩 필터·접힌 칩 해제 · 태그명 검색 · C4 상세 칩→보드 `?tag=`·주소 정리·스크롤 복원 안 함(438→0) · 보드 오류 한국어 문구+다시 시도 복구 · **C5 백엔드 실제 재시작으로 소켓 재연결 → "다시 시도" 없이 자동 복구** · 팀 목록 오류 한국어+복구 · 375px 리스트·간트 필터 0건 "필터 초기화"가 화면 안(x=131)·가로 스크롤 없음 · 첫 방문 튜토리얼(로딩 중 채팅 → 보류, 닫으면 1회, 재방문 0) · 채팅 Esc·닫기 44×44 · 375px 칸반 칩 필터
  - C5 첫 시도 실패는 테스트 방식 — Playwright `setOffline`은 열린 웹소켓을 끊지 않아 재연결이 일어나지 않음. 백엔드 프로세스 재시작으로 재검증 ✅
- [x] F7 — 커밋·머지(사용자 지시 2026-10-20, next-bun-6c 수행·메인 확인)

## 결정
- U-001 범위: 사용자 선택 ①②③, 운영 정리 제외(의도된 더미 스케줄러) (2026-10-19)
- U-002 카드·리스트 태그 칩 버튼 터치 높이 28px 유지 — 보조 동작, 필터 패널에 44px 경로, WCAG 2.2 AA 최소 24px 충족 (메인)
- U-003 채팅 "읽은 사람" 모달 닫힌 뒤 포커스가 패널 첫 요소로 가는 것 유지 — `useDialog` 공용 동작, 바꾸려면 공용 훅 옵션(별건) (메인). 열 때도 같은 전환(채팅 cleanup이 헤더 채팅 버튼으로 잠깐 focus 후 모달로 — 최종 포커스 정상, `preventScroll` 없어 배경 스크롤 가능)이 있다(2R D)
- U-006 TagModal 오류도 공용 `extractErrorMessage`로 통일 — 2xx 비JSON(SyntaxError)·본문 읽는 중 끊김(fetch 단계 밖 TypeError)은 영문 원문이 나올 수 있으나, 일반 TypeError를 네트워크로 오안내하지 않는 1R C2 절충을 우선 (2R E)
- U-004 칩 클릭은 그 태그 하나로 필터 교체(노션 "그 태그만 보기") (메인)
- U-005 U-004의 "교체"는 **태그 축만** — 검색·상태·담당자 등 다른 필터는 유지. 상세 칩 → `?tag=` 진입도 보드 칩과 같은 의미(보드를 거쳐 왔으면 그 필터 유지, 직접 링크면 깨끗한 필터). 단 `?tag=` 진입 시 옛 스크롤 복원은 하지 않는다 (리뷰 1R C4, 메인)

## 후속
- 달력(4)·간트(7)·UserAvatar(3)·CountBadge·ChatUnreadCount·OnlineUsers·DateInfoInline·fishing·TeamChatPanel(시간·"전송 실패")의 9~10px 글자 — 밀도 높은 UI라 이번 범위 제외
- 보드 오류 403·404에도 "다시 시도"가 나옴 — 오류 status 보관이 필요해 별건 (2R B 잔여)
- TeamBoard `isOtherDialogOpen` 조합식 자체의 테스트 부재(조건 함수만 테스트) · TeamManagementSection 내부 멤버 상태 전환 확인 모달은 조합식 미포함(로딩 중 열기 어려움) (3R)
- 오류 화면에서도 FAB·헤더 "새 카드 작성" 노출, 비숫자 팀 ID면 `/teams/abc/tasks/new` 이동 — 기존 동작(이번 diff 무관) (3R 참고)
- `useDialog` 대화상자 스택(최상위만 Esc·Tab 처리)·열고 닫을 때 포커스 전환·`preventScroll` — 공용 훅 변경이라 별건 (1R C1·2R A·D의 근본 해법)

## 위험 & 롤백
- 프론트 단독 변경, 계약 변경 없음 → revert로 롤백
