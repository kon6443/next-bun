# Teams SEO 랜딩 페이지 구현

## 목표
`/teams` 페이지에 비로그인 사용자/크롤러용 **공개 랜딩 페이지**를 추가하여 SEO 검색 유입을 확보한다.
팀 협업 기능이 이 서비스의 메인이므로, 검색 결과에서 해당 기능이 노출되어야 한다.

## 배경
- 현재 `/teams/page.tsx`는 전체가 `'use client'`이며 `useSession()`으로 세션 체크 후 `TeamsClient`를 렌더링
- 크롤러/비로그인 사용자는 의미 있는 HTML을 받지 못함 → 색인 불가
- robots.ts에서 `/teams`를 disallow 중 → 랜딩 추가 후 allow로 변경 필요
- `TeamsClient.tsx`의 `LoginPrompt` 컴포넌트에 이미 기능 소개 카드 4개가 존재 (칸반 보드, 실시간 협업, 캘린더 뷰, 팀원 초대) → 랜딩 페이지와 내용 중복 주의
- **`getServerSession`은 프로젝트 내 최초 도입** — 기존 코드는 전부 `useSession()` 클라이언트 훅 사용. import/동작 검증 필수
- **middleware.ts 미존재** — 미들웨어 분기 대안은 신규 생성이 필요함 (Phase 4 리스크 대응 참고)

## 구현 전략: 서버 컴포넌트 분기

### 파일 구조 변경 (Before → After)

```
Before:
  teams/
    page.tsx          ← 'use client', useSession() 전체
    TeamsClient.tsx   ← 팀 목록 + LoginPrompt (기능 카드 4개 포함)
    LoginButton.tsx   ← 카카오 로그인 버튼 (signIn("kakao"))
    layout.tsx        ← metadata
    components/
      index.ts        ← TeamsPageLayout, ButtonLink, SectionLabel 등

After:
  teams/
    page.tsx          ← 서버 컴포넌트, getServerSession()으로 분기
    TeamsDashboard.tsx ← 'use client', 기존 page.tsx 로직 이동
    TeamsClient.tsx   ← 팀 목록 UI (LoginPrompt 간소화)
    TeamsLanding.tsx  ← 서버 컴포넌트, SEO 랜딩 페이지
    LoginButton.tsx   ← 기존 그대로 (랜딩에서도 재사용)
    layout.tsx        ← metadata 업데이트
    components/
      index.ts        ← 기존 그대로
```

### 분기 흐름
```
요청 → /teams/page.tsx (서버)
         │
         ├─ getServerSession(authOptions) 세션 + accessToken 존재
         │    → <TeamsDashboard />
         │        └─ 기존 useSession + useAuthenticatedFetch + TeamsClient 로직
         │
         └─ 세션 없음 또는 accessToken 없음
              → <TeamsLanding />
                  └─ 정적 소개 페이지 (SSR, 크롤러 색인 가능)
                      └─ CTA: LoginButton (카카오 로그인)
```

## 태스크

### Phase 1: 랜딩 페이지 생성 ✅ 완료
- [x] `src/app/teams/TeamsLanding.tsx` 서버 컴포넌트 작성

#### 랜딩 페이지 섹션 구성
```
1. 히어로 섹션
   - <h1>: "팀 프로젝트, 한곳에서 관리하세요"
   - <p>: "칸반 보드, 실시간 협업, 팀원 초대까지. 무료로 시작하세요."
   - CTA: LoginButton (variant="primary") — 텍스트: "카카오로 시작하기"
   - 보조 CTA: Link to /fishing — 텍스트: "낚시 게임 먼저 해보기"

2. 기능 소개 섹션 (6개 카드, grid sm:grid-cols-2)
   ┌──────────────────┬──────────────────┐
   │ 칸반 보드         │ 실시간 협업       │
   │ 태스크 상태별로    │ 팀원의 변경사항이  │
   │ 정리하고 한눈에    │ 즉시 반영됩니다.  │
   │ 파악하세요.       │ 소켓 기반 실시간   │
   │                  │ 동기화.           │
   ├──────────────────┼──────────────────┤
   │ 역할 관리         │ 팀원 초대          │
   │ MASTER, MANAGER,  │ 초대 링크 하나로   │
   │ MEMBER 3단계      │ 팀원을 추가하세요. │
   │ 권한 체계.        │                   │
   ├──────────────────┼──────────────────┤
   │ 캘린더 뷰         │ 디스코드 연동      │
   │ 마감일 기반으로    │ 태스크 변경 시     │
   │ 일정을 한눈에.    │ 디스코드 알림 자동. │
   └──────────────────┴──────────────────┘

   ※ 기존 LoginPrompt 카드 텍스트:
     - '칸반 보드' / '태스크를 드래그 앤 드롭으로 관리하세요.'
     - '실시간 협업' / '팀원의 변경사항이 즉시 반영됩니다.'
     - '캘린더 뷰' / '일정 기반으로 태스크를 한눈에 파악하세요.'
     - '팀원 초대' / '링크 하나로 팀원을 초대할 수 있습니다.'
   → 랜딩은 이 텍스트를 기반으로 하되, 더 상세한 설명 추가

3. FAQ 섹션 (Schema.org FAQPage)
   - "무료인가요?" → "네, 모든 기능을 무료로 이용할 수 있습니다."
   - "몇 명까지 팀원을 초대할 수 있나요?" → 실제 제한 확인 후 작성 (백엔드 확인 필요)
   - "모바일에서 사용할 수 있나요?" → "모바일 브라우저에서 완벽하게 지원됩니다."
   - "어떤 로그인이 필요한가요?" → "카카오 계정으로 간편하게 로그인할 수 있습니다."

4. CTA 반복 섹션
   - "지금 시작하기" LoginButton (variant="primary")

5. PublicFooter
```

#### 구조화 데이터
- [x] Schema.org `WebApplication` JSON-LD
  ```json
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "FiveSouth 팀 협업",
    "description": "칸반 보드, 실시간 태스크 관리, 팀원 초대까지. 팀 프로젝트를 한곳에서 관리하세요.",
    "applicationCategory": "ProjectManagement",
    "operatingSystem": "Web Browser",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "KRW" }
  }
  ```
- [x] Schema.org `FAQPage` JSON-LD (FAQ 섹션용)
- [x] Schema.org `BreadcrumbList` JSON-LD

#### 디자인 규칙
- 기존 `fishing/about/page.tsx` 스타일과 통일: slate 다크 테마, `max-w-2xl`, `rounded-2xl` 카드
- CTA 버튼: LoginButton (variant="primary") 재사용 — `bg-gradient-to-r from-indigo-500 to-sky-500` 그라데이션
- 보조 CTA: `rounded-xl border border-slate-700 hover:border-slate-500` (기존 패턴)
- 기능 카드: `rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5` (about 페이지와 통일)
- FAQ: `<details>` 아코디언 (about 페이지 패턴)
- **TeamsPageLayout 사용 여부**: 사용하지 않음 — TeamsPageLayout은 `max-w-lg` 기본이고 대시보드용 배경 스타일. 랜딩은 `max-w-2xl`로 fishing/about과 통일

### Phase 2: 라우팅 분기 ✅ 완료
- [x] `src/app/teams/TeamsDashboard.tsx` 생성 — 기존 `page.tsx`의 클라이언트 로직 이동
  ```tsx
  // TeamsDashboard.tsx ('use client')
  'use client';

  import { useCallback } from 'react';
  import { useSession } from 'next-auth/react';
  import { getMyTeams, type TeamMemberResponse } from '@/services/teamService';
  import type { TeamSummary } from '@/types/team';
  import { useAuthenticatedFetch } from '@/app/hooks';
  import TeamsClient from './TeamsClient';

  export default function TeamsDashboard() {
    const { data: session } = useSession();
    const fetchTeams = useCallback(async (accessToken: string) => {
      const response = await getMyTeams(accessToken);
      return response.data.map(
        (team: TeamMemberResponse): TeamSummary => ({
          teamId: team.teamId,
          name: team.teamName,
          description: team.teamDescription || '',
          role: team.role,
        }),
      );
    }, []);
    const { data: teams, isLoading, error } = useAuthenticatedFetch(fetchTeams);
    return <TeamsClient session={session} initialTeams={teams ?? []} error={error} isLoading={isLoading} />;
  }
  ```

- [x] `src/app/teams/page.tsx`를 서버 컴포넌트로 변경
  ```tsx
  // page.tsx (서버 컴포넌트 — 'use client' 없음)
  import { getServerSession } from 'next-auth';
  import { authOptions } from '@/lib/auth';
  import TeamsDashboard from './TeamsDashboard';
  import TeamsLanding from './TeamsLanding';

  export default async function TeamsPage() {
    const session = await getServerSession(authOptions);
    if (session?.user?.accessToken) {
      return <TeamsDashboard />;
    }
    return <TeamsLanding />;
  }
  ```

  **⚠️ getServerSession 최초 도입 주의사항:**
  - `authOptions`는 `src/lib/auth.ts`에서 export됨 — import 경로: `@/lib/auth`
  - 기존 프로젝트는 `useSession()` 클라이언트 훅만 사용해왔음
  - `getServerSession()`은 서버 컴포넌트/API Route에서만 호출 가능
  - 반환값은 `useSession()`의 `data`와 동일한 Session 타입
  - **검증**: 로컬에서 로그인/비로그인 상태 모두 테스트 필수

- [x] `TeamsClient.tsx`의 `LoginPrompt` 컴포넌트 간소화
  - 현재 LoginPrompt 코드 (145-180줄):
    - 로그인 CTA + 기능 카드 4개
  - 변경 방향: 기능 카드 제거, 로그인 CTA만 남김
    - 이유: 로그인 사용자의 세션 만료 시에만 보이는 fallback. 기능 소개는 랜딩이 담당
  - 또는: `TeamsDashboard`에서 세션 체크 후 리다이렉트하므로 LoginPrompt 자체가 불필요할 수 있음
    - 서버에서 이미 분기하므로, 클라이언트에서 세션 없는 케이스는 "세션 만료" 상황뿐
    - 이 경우 `LoginPrompt` → 간단한 "세션이 만료되었습니다. 다시 로그인해주세요." 메시지로 축소

### Phase 3: SEO 설정 업데이트 ✅ 완료
- [x] `src/app/robots.ts` 수정
  ```ts
  rules: [
    {
      userAgent: '*',
      allow: ['/', '/fishing', '/teams'],
      disallow: ['/teams/', '/mypage', '/auth', '/api'],
    },
  ],
  ```
  **⚠️ robots.txt 경로 매칭 규칙:**
  - `/teams` (trailing slash 없음) = 정확히 `/teams` 페이지만
  - `/teams/` (trailing slash 있음) = `/teams/` 하위 모든 경로 (`/teams/123`, `/teams/new` 등)
  - allow와 disallow가 충돌하면 **더 긴(구체적인) 규칙이 우선**
  - 따라서 allow `/teams` + disallow `/teams/`는 의도대로 동작함
  - **배포 후 반드시 `/robots.txt` 접속해서 실제 출력 확인할 것**

- [x] `src/app/sitemap.ts` — `/teams` 항목 추가
  ```ts
  {
    url: `${SITE_CONFIG.url}/teams`,
    lastModified: LAST_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.9,  // 메인 기능이므로 높은 우선순위
  },
  ```

- [x] `src/app/teams/layout.tsx` — metadata 업데이트
  ```ts
  export const metadata: Metadata = {
    title: '팀 협업',
    description: '칸반 보드, 실시간 태스크 관리, 역할 기반 권한, 팀원 초대까지. 팀 프로젝트를 한곳에서 관리하세요.',
    openGraph: {
      title: `팀 협업 | ${SITE_CONFIG.name}`,
      description: '칸반 보드, 실시간 태스크 관리, 팀원 초대까지.',
      type: 'website',
      locale: SITE_CONFIG.locale,
    },
    keywords: ['팀 협업', '프로젝트 관리', '칸반 보드', '실시간 협업', '태스크 관리', '팀 관리 도구'],
  };
  ```

- [x] `src/app/teams/opengraph-image.tsx` — teams 전용 OG 이미지 생성

- [x] `src/app/fishing/guide/TeamsPromoBanner.tsx` — 링크 텍스트 검토
  - 현재: "팀 보드 시작하기" → `/teams`로 링크
  - 랜딩 존재 후에도 동일 링크이므로 변경 불필요. 단, 비로그인 유저가 이 링크를 타면 랜딩으로 자연스럽게 연결됨 → 의도대로 동작

### Phase 4: 캐싱 및 성능 ✅ 완료
- [x] `/teams/page.tsx`에 `export const dynamic = 'force-dynamic'` 설정
  - `getServerSession()`은 요청마다 쿠키 기반으로 세션을 확인 → 정적 생성 불가
  - Next.js가 자동 감지할 수도 있지만, 명시적 설정이 안전
- [x] 랜딩 페이지 자체는 정적 HTML → TTFB 영향 최소

### Phase 5: 검증 ✅ 완료
- [x] `bun run build` 성공 확인
- [x] **getServerSession 동작 검증**
  - [x] 비로그인 → `TeamsLanding` 렌더링 확인
  - [x] 로그인 → `TeamsDashboard` 렌더링 확인
  - [x] 로그아웃 → `TeamsLanding` 복귀 확인
- [x] View Source에서 랜딩 HTML 서버 렌더링 확인
- [x] `/sitemap.xml`에 `/teams` 포함 확인
- [x] `/robots.txt`에서 `/teams` allow, `/teams/` disallow 확인
- [x] Google Search Console URL 검사
- [x] 카카오톡 OG 미리보기 확인

## 참고 파일
| 파일 | 역할 | 변경 여부 |
|------|------|-----------|
| `src/app/teams/page.tsx` | 진입점 | **변경** (서버 컴포넌트로 전환) |
| `src/app/teams/TeamsClient.tsx` | 팀 목록 UI + LoginPrompt | **변경** (LoginPrompt 간소화) |
| `src/app/teams/layout.tsx` | 메타데이터 | **변경** (description/keywords 업데이트) |
| `src/app/teams/LoginButton.tsx` | 카카오 로그인 버튼 (`signIn("kakao")`) | 참고 (랜딩 CTA에서 재사용) |
| `src/app/teams/components/index.ts` | TeamsPageLayout, SectionLabel 등 | 참고 (랜딩에서는 사용 안 함) |
| `src/lib/auth.ts` | authOptions 정의 | 참고 (`getServerSession(authOptions)` 호출) |
| `src/app/hooks/useAuthenticatedFetch.ts` | 인증 API 호출 훅 | 참고 (TeamsDashboard에서 사용) |
| `src/app/fishing/about/page.tsx` | 랜딩 디자인/구조 참고 | 참고 |
| `src/app/fishing/guide/TeamsPromoBanner.tsx` | 낚시→팀 유도 배너 | 검토 (링크 동작 확인) |
| `src/app/robots.ts` | 크롤러 규칙 | **변경** |
| `src/app/sitemap.ts` | 사이트맵 | **변경** |

## 사전 확인 완료 사항 (구현 전 검증됨)
- [x] `authOptions` — **named export** (`src/lib/auth.ts`), import 경로: `@/lib/auth`
- [x] `session.user.accessToken` — 타입 안전. `src/types/next-auth.d.ts`에서 declaration merging으로 `accessToken?: string | null` 정의됨. `auth.ts`의 `session` callback이 토큰→세션 복사를 수행하므로 `getServerSession()`에서도 `accessToken` 포함 확인됨
- [x] `SessionProvider` — root layout(`src/app/layout.tsx`)에서 감싸므로 `TeamsDashboard` 내 `useSession()` 정상 동작
- [x] 서버/클라이언트 세션 깜빡임 — `useAuthenticatedFetch`는 내부적으로 `useState(true)` + 반환값에서 `status === 'loading' || isLoading`으로 조합. `useSession` status가 'loading'인 동안 `isLoading=true`를 반환. `TeamsClient`는 헤더/팀목록 두 섹션 모두 `isLoading`을 먼저 체크하여 스켈레톤을 표시하므로 `isAuthenticated=false`로 인한 LoginPrompt 깜빡임 없음 (코드 추적 검증 완료: `useAuthenticatedFetch.ts:32,80`, `TeamsClient.tsx:33,64`)
- [x] `page.tsx` — 다른 파일에서 import 없음 (App Router 파일 기반 라우팅). 변경 시 사이드이펙트 없음
- [x] `next.config.ts` — `output: "standalone"`, experimental 옵션 없음. `getServerSession` 동작에 영향 없음
- [x] `LoginButton` — `signIn("kakao")` 호출, variant="primary"이면 `bg-gradient-to-r from-indigo-500 to-sky-500`
- [x] `TeamsPageLayout` — `max-w-lg` 기본, 대시보드 전용 배경. 랜딩에서는 사용 안 함
- [x] `middleware.ts` — 프로젝트에 없음. 미들웨어 분기 대안은 신규 생성 필요

## 주의사항
1. **getServerSession 최초 도입**
   - authOptions는 `src/lib/auth.ts`에서 named export (`@/lib/auth`)
   - 기존 프로젝트는 `useSession()` 클라이언트 훅만 사용
   - 서버에서의 세션 체크가 올바르게 동작하는지 로컬 테스트 필수
   - `session.user.accessToken` 타입은 `src/types/next-auth.d.ts`에서 확장 확인됨 → 타입 에러 없을 것

2. **서버/클라이언트 경계**
   - `page.tsx`에 `'use client'` 절대 넣지 않기
   - `LoginButton`은 `'use client'`지만 서버 컴포넌트에서 import 가능 (Next.js가 클라이언트 바운더리 자동 처리)
   - `TeamsDashboard`는 `'use client'`로 선언 — 내부에서 `useSession`, `useAuthenticatedFetch` 사용

3. **LoginPrompt vs TeamsLanding 역할 구분**
   - `LoginPrompt`: 대시보드 내 세션 만료 시 fallback (인앱)
   - `TeamsLanding`: 크롤러/신규 방문자용 SEO 소개 페이지
   - 텍스트 유사하지만 마크업/구조화 데이터/목적이 다르므로 별도 컴포넌트가 맞음

4. **TeamsPageLayout 미사용 이유**
   - TeamsPageLayout은 `max-w-lg` 기본값 + 대시보드 전용 배경 그라데이션
   - 랜딩은 `max-w-2xl`로 fishing/about 페이지와 레이아웃 통일
   - 다른 퍼블릭 페이지(about, guide)와 시각적 일관성이 더 중요

## 리스크 및 롤백
| 리스크 | 영향 | 대응 |
|--------|------|------|
| `getServerSession()` 동작 안 함 (최초 도입) | 높음 | 로컬에서 로그인/비로그인 모두 테스트. 실패 시 `useSession` 기반 클라이언트 분기로 fallback (SSR 이점은 잃지만 기능은 유지) |
| 서버/클라이언트 세션 불일치 깜빡임 | 중간 | 서버에서 `getServerSession()`으로 로그인 판정 → `TeamsDashboard` 렌더 → 클라이언트에서 `useSession()` 초기 status="loading" 동안 `isAuthenticated=false`가 될 수 있음. **대응: 현재 `TeamsClient`의 `isLoading` prop이 이미 스켈레톤을 보여주므로 깜빡임 없음.** 단, `TeamsDashboard`에서 `useAuthenticatedFetch`의 `isLoading` 초기값이 true인지 확인 필수 |
| `/teams` TTFB 증가 | 낮음 | 세션 체크는 수 ms 수준. 실측 후 문제 시 미들웨어 분기로 전환 (middleware.ts 신규 생성 필요) |
| 기존 팀 목록 UI 깨짐 | 중간 | `TeamsDashboard`는 기존 `page.tsx` 코드 그대로 이동. 빌드 + 수동 테스트로 확인 |
| robots.txt 규칙 오작동으로 `/teams/123` 등 노출 | 중간 | 배포 직후 `/robots.txt` 확인. 문제 시 `/teams` allow 제거만으로 즉시 롤백 |
| LoginPrompt 제거 후 세션 만료 UX 공백 | 낮음 | 완전 제거하지 않고 간소화. "세션 만료" 메시지 + 로그인 버튼만 남김 |

## 완료 기준 (DoD) ✅ 전체 완료
- [x] 비로그인 `/teams` → 서버 렌더링된 랜딩 (View Source에서 확인)
- [x] 로그인 `/teams` → 기존 팀 목록 대시보드 (기능 동일)
- [x] 구조화 데이터 (WebApplication, FAQPage, BreadcrumbList) 삽입
- [x] robots.txt에서 `/teams` allow, `/teams/` disallow
- [x] sitemap.xml에 `/teams` 포함
- [x] OG 이미지 + metadata 설정
- [x] `bun run build` 성공
- [x] Google Search Console URL 검사 통과
