import type { Metadata } from 'next';
import Link from 'next/link';
import { RIVER_FISH } from '../data/fish';
import { GRADE_COLORS, GRADE_NAMES } from '../config/constants';
import { SITE_CONFIG } from '../../config/siteConfig';
import type { FishGrade } from '../types/fish';
import { getDifficultyLabel } from '../utils/format';
import TeamsPromoBanner from './TeamsPromoBanner';
import PublicFooter from '../../components/PublicFooter';

export const metadata: Metadata = {
  title: '낚시 도감',
  description: '방치형 낚시 게임에 등장하는 15종의 민물고기 도감. 등급별 출현 확률, 크기, 난이도 정보를 확인하세요.',
  openGraph: {
    title: `낚시 도감 | ${SITE_CONFIG.name}`,
    description: '방치형 낚시 게임에 등장하는 15종의 민물고기 도감.',
    type: 'website',
    locale: SITE_CONFIG.locale,
  },
  keywords: ['낚시 도감', '민물고기 도감', '낚시 게임 공략', '물고기 종류', '방치형 낚시'],
  alternates: { canonical: '/fishing/guide' },
};

const GRADE_ORDER: FishGrade[] = ['legendary', 'epic', 'rare', 'uncommon', 'common'];

const GRADE_BG: Record<FishGrade, string> = {
  common: 'bg-slate-700/40 border-slate-600/30',
  uncommon: 'bg-emerald-900/30 border-emerald-700/30',
  rare: 'bg-blue-900/30 border-blue-700/30',
  epic: 'bg-purple-900/30 border-purple-700/30',
  legendary: 'bg-amber-900/30 border-amber-700/30',
};

function getDifficultyBar(difficulty: number): string {
  const filled = Math.round(difficulty * 5);
  return '■'.repeat(filled) + '□'.repeat(5 - filled);
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: '낚시 게임', item: `${SITE_CONFIG.url}/fishing` },
    { '@type': 'ListItem', position: 2, name: '도감' },
  ],
};

export default function FishingGuidePage() {
  const fishByGrade = GRADE_ORDER.map((grade) => ({
    grade,
    fish: RIVER_FISH.filter((f) => f.grade === grade),
  })).filter((g) => g.fish.length > 0);

  const totalCatchWeight = RIVER_FISH.reduce((sum, f) => sum + f.catchWeight, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="mx-auto max-w-2xl px-4 pb-24 pt-12">
        {/* 헤더 */}
        <header className="mb-8">
          <nav className="mb-4 text-sm text-slate-400">
            <Link href="/fishing" className="hover:text-sky-400 transition-colors">
              낚시 게임
            </Link>
            <span className="mx-2">/</span>
            <span className="text-slate-200">도감</span>
          </nav>
          <h1 className="text-3xl font-bold">낚시 도감</h1>
          <p className="mt-2 text-slate-400">
            총 {RIVER_FISH.length}종의 민물고기를 만나보세요.
            등급이 높을수록 출현 확률이 낮고, 챌린지 난이도가 올라갑니다.
          </p>
        </header>

        {/* 등급별 섹션 */}
        {fishByGrade.map(({ grade, fish }) => (
          <section key={grade} className="mb-10">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: GRADE_COLORS[grade] }}
              />
              {GRADE_NAMES[grade]} ({fish.length}종)
            </h2>

            <div className="flex flex-col gap-3">
              {fish.map((f) => {
                const catchPercent = ((f.catchWeight / totalCatchWeight) * 100).toFixed(1);
                return (
                  <Link
                    key={f.id}
                    href={`/fishing/guide/${f.id}`}
                    className={`block rounded-2xl border p-4 transition-colors hover:border-sky-500/50 ${GRADE_BG[f.grade]}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                          style={{ backgroundColor: f.color + '33', color: f.color }}
                        >
                          🐟
                        </div>
                        <div>
                          <h3 className="font-semibold">{f.name}</h3>
                          <p className="text-sm text-slate-400">{f.description}</p>
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: GRADE_COLORS[f.grade] + '22',
                          color: GRADE_COLORS[f.grade],
                        }}
                      >
                        {GRADE_NAMES[f.grade]}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
                      <div>
                        <span className="block text-slate-500">크기</span>
                        {f.minSize}~{f.maxSize}cm
                      </div>
                      <div>
                        <span className="block text-slate-500">출현율</span>
                        {catchPercent}%
                      </div>
                      <div>
                        <span className="block text-slate-500">난이도</span>
                        <span className="font-mono text-[10px]">{getDifficultyBar(f.difficulty)}</span>
                        {' '}{getDifficultyLabel(f.difficulty)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/* CTA */}
        <div className="mt-12 rounded-2xl border border-sky-500/20 bg-sky-900/20 p-6 text-center">
          <h2 className="text-lg font-semibold">직접 낚아보세요!</h2>
          <p className="mt-1 text-sm text-slate-400">
            로그인 없이 바로 플레이할 수 있습니다.
          </p>
          <Link
            href="/fishing"
            className="mt-4 inline-block rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            낚시 게임 시작하기
          </Link>
        </div>

        <TeamsPromoBanner />
      </div>

      <PublicFooter />
    </div>
  );
}
