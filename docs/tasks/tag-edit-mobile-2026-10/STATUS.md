# 모바일 태그 수정 — 저장 버튼 가림 · 미저장 변경 유실 (2026-10)

- **상태**: 🟢 구현·리뷰 루프(3R, 확정 결함 0)·최종 검토·4기종 브라우저 검증 15/15 완료 — 사용자 지시로 커밋·`fix-onam-tag-edit-mobile → develop → main` 머지 (2026-10-20). 머지·배포 결과는 GitHub PR·Actions가 기록(`gh pr list --state merged --head fix-onam-tag-edit-mobile`)
- **브랜치**: `fix-onam-tag-edit-mobile` (`origin/develop` `fdc4aa6`) · worktree `next-bun/.claude/worktrees/tag-edit-mobile`
- **세션**: 메인 `bun-f5`(문서·브라우저 검증·사용자 소통) / 구현·리뷰 루프 `next-bun-6c`. 프론트 전용 — 백엔드 변경 없음

## 문제 (사용자 보고, 운영 모바일)
태그 관리 → 태그 색상 수정 시 모달 아랫부분이 가려져 저장하려면 모달 안을 스크롤해야 한다. 저장 버튼이 없는 줄 알고 하단 "닫기"를 눌러 변경이 버려지고, "색상 변경이 안 된다"고 착각한다.

## 원인 (메인 브라우저 실측 + next-bun-6c 코드 분석)
- 실측(Playwright, 로컬 = main 334353a): 편집 폼 높이 529px, 모달 스크롤 영역 실효 높이 iPhone SE 276 · iPhone 13 363 · Pixel 5 419 · iPhone 13 Pro Max 436px → **4기종 모두 첫 화면에 저장 버튼 없음**(SE·13은 뷰포트 밖, Pixel 5·Pro Max는 하단 "닫기" 바 아래). 스크린샷: 메인 세션 scratchpad `e2e/out/mobile-*-edit.png`
- 구조(`TagModal.tsx`): 바텀시트 `max-h-[90dvh]`(:266), 고정 영역 헤더(:268)·검색(:282)·footer "닫기"(:374, safe-area 포함) ≈ 265px. 편집 폼 `TagEditor`(:557)는 스크롤 영역(:316) 안 태그 행 아래 인라인 — 저장·취소·삭제 줄(:603-629)이 폼 맨 아래. 편집을 열 때 scrollIntoView 없음
- 착각 요인: footer의 그라데이션 주 버튼 "닫기"가 항상 보임, 닫기·Esc·오버레이·X 모두 미저장 이름·색을 확인 없이 버림(dirty 검사 0), 색 선택은 미리보기만 바뀌어 저장된 것처럼 보임
- dvh는 이미 사용(주소창 원인 아님). 입력 포커스 시 iOS 키보드는 보조 요인. 같은 `TagEditor`를 쓰는 select 모드(태스크 폼 태그 선택)도 동일. 다른 모달은 해당 없음

## 결정
- T-001 수정안 **A + D** (사용자 승인 2026-10-20 "AD 권장대로")
  - A: 편집 중에는 모달 footer를 "닫기" 대신 **"취소 / 저장"**으로. `TagEditor`를 `<form id>`로 감싸고 footer 저장은 `type="submit" form=id`(상태 끌어올리기 없음). 삭제는 폼 안에 유지. 편집을 열면 폼을 scrollIntoView
  - D: 편집 중 미저장 변경(dirty)이 있으면 닫기·Esc·오버레이·헤더 X에서 확인창 — 문구 "저장하지 않은 변경을 버릴까요?", 버튼 **"변경 버리기" / "계속 편집"**(태그 삭제 확인 ConfirmModal 패턴 재사용)
  - 오버레이 클릭 닫기는 원래 없음 → D 대상은 X·Esc·footer 닫기
  - 버린 대안: B 버튼 줄 sticky(footer "닫기"와 두 줄 → 오클릭 위험 잔존), C 피커 압축 단독(SE에서 여전히 넘침), 색 즉시 저장(드래그마다 PATCH·취소 불가)

- T-002 같은 "미저장 변경 조용히 유실" 경로 2건도 D 범위로 포함(메인 승인): ① 편집 중 다른 태그 연필(편집 전환)도 dirty면 확인 ② 검색어 입력으로 편집 중인 행이 필터되어 폼이 사라지지 않게 편집 행은 목록에 유지

- T-003 HEX 입력 칸의 Enter·모바일 키보드 "이동"도 저장(footer 저장이 폼의 기본 제출 버튼) — "Enter 제출도 동일" 기준과 같은 방향 (리뷰 1R 판정, 메인)
- T-004 저장 진행 중에는 X·Esc·취소·다른 태그 편집 전환을 무시 / 원격 변경(`tagUpdated`)과 내 수정이 겹치면 **내가 고친 칸만** PATCH (리뷰 1R)

## 수용 기준
- 4기종(iPhone SE·13·13 Pro Max·Pixel 5)에서 편집을 열면 **첫 화면에 저장·취소가 보인다**(스크롤 없이)
- 편집 중 footer에 "닫기"가 없다. 편집을 닫으면 footer는 다시 "닫기"
- 저장(footer)으로 색·이름이 서버에 반영된다. Enter 제출도 동일
- 미저장 변경이 있을 때 닫기·Esc·오버레이·X → 확인창, "계속 편집"이면 편집 유지, "변경 버리기"면 닫힘. 변경이 없으면 확인창 없이 닫힘
- manage·select 두 모드 모두 적용. `useDialog` 포커스 트랩·Esc가 확인창과 충돌하지 않는다
- lint 0/0 · typecheck · test:run · build ✅, 회귀 테스트(footer 전환·submit·dirty 확인)

## 진행 체크리스트
- [x] M1 — 구현(next-bun-6c): `TagModal.tsx` 1파일 + 신규 `TagModal.test.tsx` 9건. 편집 중 footer 취소/저장(form submit, 저장 중 비활성), 폼 안엔 "태그 삭제"만, 편집 열면 행 scrollIntoView, 편집 태그가 사라지면 footer "닫기" 복귀, submit `stopPropagation`(select 모드에서 바깥 TaskForm 제출 번짐 방지), dirty면 X·Esc → 확인창(확인창 중 모달 useDialog 비활성, 저장 중 Esc 무시). typecheck 0 · ESLint 0/0 · test:run 353/353(+9) · 뮤테이션 4종(확인창 중 useDialog 게이트는 jsdom이 못 잡음 — 방어로 유지)
- [x] M2 — 리뷰 루프(next-bun-6c: review-front + /review Opus, 교차검증, 확정 결함 0까지) — **3R 확정 0으로 종료**. 3R 마무리 2건: 이름 검증 실패 시 이름 칸 scrollIntoView(포커스는 안 옮김 — 모바일 키보드), 테스트 scrollIntoView mock 위생. 최종 typecheck 0 · ESLint 0/0 · test:run 360/360(`TagModal.test.tsx` 16건)
  - 1R: 확정 3(교차검증은 두 리뷰어의 독립 재현 + 수정 전 실패하는 회귀 테스트로 갈음) — medium: 같은 태그 연필 재클릭 → "변경 버리기"해도 편집 유지(토글 updater) · medium: 저장 중 X·다른 태그 전환이 살아 있어 버린 뒤에도 PATCH 반영/다른 편집을 닫음(saving이면 무시 + X disabled) · low: 편집 중 다른 팀원 `tagUpdated`로 손대지 않은 칸도 dirty·저장 시 상대 변경 덮어씀(편집 연 시점 값 기준으로 dirty·요청). test:run 357/357(+4) · 뮤테이션 4종. nit 후속: 저장·취소 후 포커스가 body로(편집 행 연필로 복귀 개선 여지)
  - 2R: 1R 회귀 없음. 확정 3 — low: X·Esc로 닫으면 편집 상태가 남아 다시 열 때 이전 폼이 붙고 그 행으로 스크롤(닫을 때 편집 종료) · medium~low: 이름 검증 오류가 폼 맨 아래라 작은 화면에서 저장이 "반응 없음"처럼 보임(오류를 이름 칸 아래로, aria-invalid·describedby) · nit(base에도 있음): 이름을 안 고쳤는데 원격 변경으로 생긴 이름 겹침이 색 저장을 막음(이름을 고쳤을 때만 중복 검사). test:run 360/360(+3) · 뮤테이션 3종. 결함 아님: StrictMode 저장 직후 X 잠깐 disabled(약 300ms 내 복귀)
- [x] M3 — 메인 최종 검증(2026-10-20): 변경분 잔여물 0 · `pnpm ci:core` lint 0/0 · typecheck 0 · 360/360 · build ✅. 브라우저(Playwright, 실제 백엔드·Oracle) **15/15** — iPhone SE·13·13 Pro Max는 **WebKit(Safari 엔진)**, Pixel 5는 Chromium:
  - 4기종 모두 편집을 열면 첫 화면에 footer 취소·저장(저장 y: SE 507~551 / 13 603~647 / Pro Max 685~729 / Pixel 5 666~710), footer "닫기" 없음, 바깥 페이지 스크롤 0(iOS scrollIntoView 전파 없음)
  - 4기종: 추천 색 → footer 저장 → 서버 반영(iOS `form` 속성 제출 동작) + footer "닫기" 복귀 / 미저장 변경 + X → 확인창 → "계속 편집" 유지 → "변경 버리기" 닫힘·서버 값 유지
  - iPhone SE: 이름 비우고 저장 → 이름 칸 오류 "태그 이름을 입력해주세요."가 화면 안·서버 미변경 / HEX 칸 Enter 저장
  - iPhone 13 select 모드(태스크 생성 폼): footer 저장 → 색 반영, 태스크 폼은 제출되지 않음(`/tasks/new` 유지)
  - 첫 실행 실패들은 테스트 쪽: 저장 버튼이 "저장 중..."으로 바뀐 것을 완료로 오인(서버 폴링으로 교체), 편집 행 스크롤 애니메이션 중 클릭(HEX 반영 확인 후 진행), Chromium 실행 파일 버전(channel chrome). 단독 재현에서 PATCH·반영 정상 확인
  - 참고: 스크린샷 왼쪽 아래 "N" 원은 Next dev 표시기(운영 빌드에는 없음)
- [x] M4 — 커밋·머지(사용자 지시 2026-10-20, next-bun-6c 수행·메인 확인)

## 후속
- footer 저장·취소 후 포커스가 body로 빠짐 → 편집 종료 후 그 행 연필로 포커스 복귀
- 공용 `useDialog` 재활성 시 첫 요소 포커스(ux-polish U-003 계열)
- 확인창 중 TagModal `useDialog` 비활성 게이트는 jsdom 테스트로 검출 불가(방어적 게이트)

## 위험 & 롤백
- 프론트 단독, 계약 변경 없음 → revert
