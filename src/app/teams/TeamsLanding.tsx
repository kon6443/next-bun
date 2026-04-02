import Link from 'next/link';
import { SITE_CONFIG } from '../config/siteConfig';
import LoginButton from './LoginButton';
import PublicFooter from '../components/PublicFooter';

const features = [
  {
    title: '칸반 보드',
    desc: '태스크를 상태별로 정리하고 한눈에 파악하세요. 드래그 앤 드롭으로 간편하게 관리합니다.',
  },
  {
    title: '실시간 협업',
    desc: '팀원의 변경사항이 즉시 반영됩니다. 소켓 기반 실시간 동기화로 항상 최신 상태를 유지하세요.',
  },
  {
    title: '역할 관리',
    desc: 'MASTER, MANAGER, MEMBER 3단계 권한 체계로 팀을 체계적으로 운영하세요.',
  },
  {
    title: '팀원 초대',
    desc: '초대 링크 하나로 팀원을 추가하세요. 복잡한 가입 절차 없이 바로 합류할 수 있습니다.',
  },
  {
    title: '캘린더 뷰',
    desc: '마감일 기반으로 일정을 한눈에 파악하세요. 놓치는 태스크 없이 관리할 수 있습니다.',
  },
  {
    title: '디스코드 연동',
    desc: '태스크 변경 시 디스코드 채널에 알림이 자동으로 전송됩니다.',
  },
];

const faqItems = [
  {
    question: '무료인가요?',
    answer: '네, 모든 기능을 무료로 이용할 수 있습니다.',
  },
  {
    question: '모바일에서 사용할 수 있나요?',
    answer: '모바일 브라우저에서 완벽하게 지원됩니다. 별도 앱 설치 없이 사용할 수 있습니다.',
  },
  {
    question: '어떤 로그인이 필요한가요?',
    answer: '카카오 계정으로 간편하게 로그인할 수 있습니다. 별도 회원가입이 필요 없습니다.',
  },
  {
    question: '팀은 몇 개까지 만들 수 있나요?',
    answer: '제한 없이 원하는 만큼 팀을 생성하고 참여할 수 있습니다.',
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

const appJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: `${SITE_CONFIG.name} 팀 협업`,
  description: '칸반 보드, 실시간 태스크 관리, 팀원 초대까지. 팀 프로젝트를 한곳에서 관리하세요.',
  applicationCategory: 'ProjectManagement',
  operatingSystem: 'Web Browser',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: SITE_CONFIG.name, item: SITE_CONFIG.url },
    { '@type': 'ListItem', position: 2, name: '팀 협업' },
  ],
};

export default function TeamsLanding() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="mx-auto max-w-2xl px-4 pb-24 pt-12">
        {/* 히어로 */}
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold">
            팀 프로젝트, 한곳에서 관리하세요
          </h1>
          <p className="mt-3 text-lg text-slate-400">
            칸반 보드, 실시간 협업, 팀원 초대까지. 무료로 시작하세요.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <LoginButton variant="primary">카카오로 시작하기</LoginButton>
            <Link
              href="/fishing"
              className="rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold transition hover:border-slate-500"
            >
              낚시 게임 먼저 해보기
            </Link>
          </div>
        </header>

        {/* 기능 소개 */}
        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold">주요 기능</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
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

        {/* CTA 반복 */}
        <div className="text-center">
          <p className="mb-4 text-slate-400">지금 바로 팀을 만들어보세요.</p>
          <LoginButton variant="primary">지금 시작하기</LoginButton>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
