# SEO 구현 태스크

> 목표: /fishing을 트래픽 엔진으로 활용하여 /teams로 유입 연결
> 영향 범위: 기존 기능 수정 없음 (전부 additive 작업)
> 브랜치: feat-onam

---

## Phase 1: 기본 SEO 인프라 구축 ✅ 완료

> 기존 코드 변경 최소, 새 파일 생성 위주

- [x] 1-0. `siteConfig.ts` 글로벌 설정 파일 생성
  - 앱 이름/URL/색상 등 단일 파일에서 관리 → 이름 변경 시 이 파일만 수정
  - `src/app/config/siteConfig.ts`

- [x] 1-1. Root metadata 교체
  - `src/app/layout.tsx` — SITE_CONFIG 참조, title template, OG, Twitter Card
  - `<html lang="ko">` 적용

- [x] 1-2. robots.ts 생성
  - `src/app/robots.ts` (동적)
  - /teams, /mypage, /auth, /api → Disallow

- [x] 1-3. sitemap.ts 생성
  - `src/app/sitemap.ts` — /, /fishing, /time-measurement

- [x] 1-4. fishing layout OG 메타데이터 추가
  - `src/app/fishing/layout.tsx` — OG, Twitter Card, keywords

- [x] 1-5. manifest.ts 생성 (동적)
  - `src/app/manifest.ts` — SITE_CONFIG 참조

- [x] 1-6. 동적 아이콘 생성
  - `src/app/icon.tsx` (512x512) + `src/app/apple-icon.tsx` (180x180)
  - SITE_CONFIG.shortName/themeColor/accentColor 참조

### Phase 1 검증 ✅
- [x] `bun run build` 성공
- [x] robots.txt, sitemap.xml, manifest.webmanifest, icon.png 라우트 확인
- [x] "FiveSouth" 하드코딩 → `siteConfig.ts` 1곳으로 통합 확인

---

## Phase 2: /fishing SEO 콘텐츠 페이지 ✅ 완료

> 모든 페이지 Server Component — 크롤러가 읽을 수 있는 정적 HTML

- [x] 2-1. 낚시 도감 메인 페이지 (`/fishing/guide`)
  - `src/app/fishing/guide/page.tsx` (Static)
  - 15종 물고기 목록, 등급별 그룹핑, 출현율/난이도 표시
  - "낚시 게임 시작하기" CTA

- [x] 2-2. 물고기 상세 페이지 (`/fishing/guide/[fishId]`)
  - `src/app/fishing/guide/[fishId]/page.tsx` (SSG, 15개 정적 생성)
  - generateStaticParams + generateMetadata
  - Schema.org Article JSON-LD 구조화 데이터
  - 기본 정보, 챌린지 난이도, 낚시 팁 섹션

- [x] 2-3. 낚시 게임 소개 페이지 (`/fishing/about`)
  - `src/app/fishing/about/page.tsx` (Static)
  - 게임 특징, 조작법 (PC/모바일), 게임 흐름 설명
  - FAQ 5개 항목 + Schema.org FAQPage JSON-LD

- [x] 2-4. sitemap.ts 업데이트
  - /fishing/about, /fishing/guide 추가
  - 15종 물고기 개별 페이지 전부 추가 (SITE_CONFIG.url 참조)

### Phase 2 검증 ✅
- [x] `bun run build` 성공 — 모든 페이지 Static/SSG 빌드
- [x] 빌드된 HTML에 텍스트 콘텐츠 존재 확인 (grep 검증)
- [x] JSON-LD 구조화 데이터 포함 확인 (Article, FAQPage)

---

## Phase 3: /fishing → /teams 유입 동선 ✅ 완료

- [x] 3-1. 크로스 프로모션 배너
  - `src/app/fishing/guide/TeamsPromoBanner.tsx` 공통 컴포넌트 생성
  - /fishing/guide, /fishing/about 하단에 "팀 협업도 함께 해보세요" 배너 추가

- [x] 3-2. 공개 페이지 공통 Footer
  - `src/app/components/PublicFooter.tsx` 생성
  - /fishing/guide, /fishing/about, /fishing/guide/[fishId] 하단에 추가
  - 내부 링크 그래프 강화 (홈, 낚시 게임, 도감, 소개, 팀 협업, 시간 측정)

- [x] 3-3. /teams 비로그인 상태 개선
  - `src/app/teams/layout.tsx` 생성 — metadata (title, OG) 추가
  - `TeamsClient.tsx` LoginPrompt 개선 — 서비스 소개 4개 기능 카드 추가
  - 기존 로그인 사용자 플로우 영향 없음 (isAuthenticated 분기 유지)

### Phase 3 검증 ✅
- [x] `bun run build` 성공
- [x] 기존 코드 수정: TeamsClient.tsx LoginPrompt만 (비로그인 상태 전용)

---

## Phase 4: 기술적 SEO 마무리 ✅ 완료

- [x] 4-1. 페이지 성능 최적화
  - 새 SEO 페이지: 183B JS (First Load 106kB) — 이미지 없는 텍스트 기반으로 최적
  - Geist 폰트: next/font가 자동 font-display:swap + 셀프호스팅 처리

- [x] 4-2. 모바일 SEO
  - fishing/guide, fishing/about: viewport `user-scalable=yes, max-scale=5` (핀치 줌 허용)
  - fishing 게임: viewport `user-scalable=no, max-scale=1` (게임 전용, 줌 차단 유지)
  - `src/app/fishing/guide/layout.tsx`, `src/app/fishing/about/layout.tsx` 생성

- [x] 4-3. 국제화/지역화
  - `<html lang="ko">` — Phase 1에서 적용 완료
  - 단일 언어(한국어)이므로 hreflang 불필요

- [x] 4-4. 최종 SEO audit
  - title 태그: 모든 페이지 고유 + `| FiveSouth` 템플릿 적용 확인
  - meta description: 모든 페이지 고유 설명 확인
  - Open Graph: og:title, og:description, og:type 확인
  - robots.txt: /teams, /mypage, /auth, /api 차단 확인
  - sitemap.xml: 19개 URL (홈 + 낚시 게임/도감/소개 + 물고기 15종 + 시간측정)
  - JSON-LD: Article (물고기 상세), FAQPage (게임 소개) 확인
  - manifest: name, short_name, theme_color 확인
  - 아이콘: icon.png (512x512) + apple-touch-icon (180x180) 확인
  - fishing layout title template 버그 발견 → 수정 완료

### Phase 4 검증 ✅
- [x] `bun run build` 성공
- [x] 빌드된 HTML에서 전 항목 grep 검증 통과

---

## Phase 5: 검색엔진 등록 ✅ 완료

- [x] 5-1. Google Search Console 등록
- [x] 5-2. Naver Search Advisor 등록
- [x] 5-3. 인증 코드 반영 + 배포
- [x] 5-4. sitemap 제출
- [x] 5-5. 주요 페이지 인덱싱 요청

### Phase 5 검증 ✅
- [x] Google Search Console 소유권 인증 완료
- [x] Naver Search Advisor 소유권 인증 완료
- [x] 인증 코드 siteConfig.ts 반영 + 배포 완료
- [x] sitemap 제출 완료
- [x] 인덱싱 요청 완료 (2026-04-09 기준)

---

## 참고사항

- **기존 코드 수정**: Phase 3-3만 기존 `/teams/page.tsx` 조건부 렌더링 추가 (나머지 전부 새 파일)
- **데이터 소스**: 물고기 데이터는 `src/app/fishing/data/fish.ts`에 이미 하드코딩됨 → API 불필요
- **키워드 타겟**: "웹 낚시 게임", "온라인 낚시", "방치형 낚시", "낚시 도감" 등 한국어 니치
- **우선순위**: Phase 1 → 2 → 3 → 4 순서 (각 Phase 독립 배포 가능)
