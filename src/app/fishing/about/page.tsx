import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_CONFIG } from '../../config/siteConfig';
import { RIVER_FISH } from '../data/fish';
import { GRADE_NAMES } from '../config/constants';
import TeamsPromoBanner from '../guide/TeamsPromoBanner';
import PublicFooter from '../../components/PublicFooter';

export const metadata: Metadata = {
  title: '낚시 게임 소개',
  description: '브라우저에서 바로 즐기는 방치형 멀티플레이어 낚시 게임. 설치 없이, 로그인 없이 지금 바로 시작하세요.',
  openGraph: {
    title: `낚시 게임 소개 | ${SITE_CONFIG.name}`,
    description: '브라우저에서 바로 즐기는 방치형 멀티플레이어 낚시 게임.',
    type: 'website',
    locale: SITE_CONFIG.locale,
  },
  keywords: ['웹 낚시 게임', '브라우저 게임', '방치형 게임', '멀티플레이어', '무료 낚시 게임'],
  alternates: { canonical: '/fishing/about' },
};

// Schema.org FAQPage 구조화 데이터
const faqItems = [
  {
    question: '로그인이 필요한가요?',
    answer: '아니요. 로그인 없이 바로 플레이할 수 있습니다. 로그인하면 멀티플레이어 채팅에 닉네임이 표시됩니다.',
  },
  {
    question: '모바일에서도 플레이할 수 있나요?',
    answer: '네. 모바일 브라우저에서 터치 조작으로 플레이할 수 있습니다. 화면 터치로 이동, 낚시 포인트 근처에서 터치로 캐스팅합니다.',
  },
  {
    question: '물고기는 몇 종류인가요?',
    answer: `총 ${RIVER_FISH.length}종의 민물고기가 등장합니다. 일반(${RIVER_FISH.filter((f) => f.grade === 'common').length}종)부터 전설(${RIVER_FISH.filter((f) => f.grade === 'legendary').length}종)까지 5단계 등급이 있습니다.`,
  },
  {
    question: '멀티플레이어는 어떻게 작동하나요?',
    answer: '같은 맵에 접속한 다른 플레이어를 실시간으로 볼 수 있습니다. 채팅으로 소통하고, 다른 플레이어의 낚시 성과도 확인할 수 있습니다.',
  },
  {
    question: '잡은 물고기는 저장되나요?',
    answer: '현재 세션 동안 인벤토리에 보관됩니다. 브라우저를 닫으면 초기화됩니다.',
  },
];

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '낚시 게임', item: `${SITE_CONFIG.url}/fishing` },
    { '@type': 'ListItem', position: 2, name: '소개' },
  ],
};

const gradeStats = (['common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((grade) => ({
  grade,
  count: RIVER_FISH.filter((f) => f.grade === grade).length,
}));

export default function FishingAboutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="mx-auto max-w-2xl px-4 pb-24 pt-12">
        {/* 브레드크럼 */}
        <nav className="mb-6 text-sm text-slate-400">
          <Link href="/fishing" className="hover:text-sky-400 transition-colors">낚시 게임</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-200">소개</span>
        </nav>

        {/* 히어로 */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold">낚시 게임</h1>
          <p className="mt-3 text-lg text-slate-400">
            브라우저에서 바로 즐기는 방치형 멀티플레이어 낚시
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/fishing"
              className="rounded-xl bg-sky-600 px-6 py-3 font-medium text-white transition-colors hover:bg-sky-500"
            >
              지금 플레이
            </Link>
            <Link
              href="/fishing/guide"
              className="rounded-xl border border-slate-700 px-6 py-3 font-medium transition-colors hover:border-slate-500"
            >
              물고기 도감
            </Link>
          </div>
        </header>

        {/* 특징 */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">게임 특징</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: '설치 불필요', desc: '브라우저만 있으면 됩니다. 앱 설치, 회원가입 없이 바로 시작.' },
              { title: '멀티플레이어', desc: '다른 플레이어와 같은 맵에서 실시간으로 낚시. 채팅과 낚시 결과 공유.' },
              { title: `${RIVER_FISH.length}종 물고기`, desc: `${gradeStats.map((g) => `${GRADE_NAMES[g.grade]} ${g.count}종`).join(', ')}의 다양한 민물고기.` },
              { title: '챌린지 시스템', desc: '입질이 오면 타이밍 맞춰 챌린지 성공! 등급이 높을수록 난이도 상승.' },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-5"
              >
                <h3 className="font-semibold">{feature.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 조작법 */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">조작법</h2>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6">
            <div className="space-y-4 text-sm">
              <h3 className="font-semibold text-base">PC (키보드)</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="font-mono text-slate-400">WASD / 방향키</dt>
                <dd>캐릭터 이동</dd>
                <dt className="font-mono text-slate-400">Space</dt>
                <dd>낚시 캐스팅 / 입질 시 반응 / 챌린지 확인</dd>
                <dt className="font-mono text-slate-400">Enter</dt>
                <dd>채팅 입력</dd>
                <dt className="font-mono text-slate-400">Esc</dt>
                <dd>취소</dd>
              </dl>

              <h3 className="mt-6 font-semibold text-base">모바일 (터치)</h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <dt className="text-slate-400">화면 터치</dt>
                <dd>해당 위치로 이동</dd>
                <dt className="text-slate-400">낚시 포인트 터치</dt>
                <dd>캐스팅 시작</dd>
                <dt className="text-slate-400">화면 아무 곳 터치</dt>
                <dd>입질 반응 / 챌린지 확인</dd>
              </dl>
            </div>
          </div>
        </section>

        {/* 게임 플로우 */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">게임 흐름</h2>
          <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6">
            <ol className="space-y-3 text-sm">
              {[
                '맵을 돌아다니며 낚시 포인트(물결 표시)를 찾습니다.',
                '낚시 포인트 근처에서 Space 또는 터치로 캐스팅합니다.',
                '물고기가 입질할 때까지 기다립니다. (3~60초)',
                '입질이 오면 3초 안에 반응합니다!',
                '챌린지 게이지가 나타납니다. 초록 구간에서 타이밍을 맞추세요.',
                '성공하면 물고기를 획득! 인벤토리에서 확인하세요.',
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600/20 text-xs font-bold text-sky-400">
                    {i + 1}
                  </span>
                  <span className="text-slate-300">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">자주 묻는 질문</h2>
          <div className="space-y-3">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl border border-slate-700/50 bg-slate-900/60"
              >
                <summary className="cursor-pointer p-5 font-medium list-none flex justify-between items-center">
                  {item.question}
                  <span className="text-slate-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-slate-400">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/fishing"
            className="inline-block rounded-xl bg-sky-600 px-8 py-3 text-lg font-medium text-white transition-colors hover:bg-sky-500"
          >
            지금 낚시하러 가기
          </Link>
        </div>

        <TeamsPromoBanner />
      </div>

      <PublicFooter />
    </div>
  );
}
