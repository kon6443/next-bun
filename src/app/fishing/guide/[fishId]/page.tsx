import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RIVER_FISH } from '../../data/fish';
import { GRADE_COLORS, GRADE_NAMES } from '../../config/constants';
import { SITE_CONFIG } from '../../../config/siteConfig';
import PublicFooter from '../../../components/PublicFooter';

interface PageProps {
  params: Promise<{ fishId: string }>;
}

function findFish(fishId: string) {
  const decoded = decodeURIComponent(fishId);
  return RIVER_FISH.find((f) => f.id === decoded);
}

export async function generateStaticParams() {
  return RIVER_FISH.map((f) => ({ fishId: f.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { fishId } = await params;
  const fish = findFish(fishId);
  if (!fish) return {};

  const title = `${fish.name} - 낚시 도감`;
  const description = `${fish.description} ${GRADE_NAMES[fish.grade]} 등급, 크기 ${fish.minSize}~${fish.maxSize}cm, 난이도 ${Math.round(fish.difficulty * 100)}%.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | ${SITE_CONFIG.name}`,
      description,
      type: 'article',
      locale: SITE_CONFIG.locale,
    },
    keywords: [fish.name, '낚시', '민물고기', GRADE_NAMES[fish.grade], '낚시 도감'],
  };
}

function getDifficultyLabel(difficulty: number): string {
  if (difficulty <= 0.15) return '매우 쉬움';
  if (difficulty <= 0.3) return '쉬움';
  if (difficulty <= 0.5) return '보통';
  if (difficulty <= 0.7) return '어려움';
  return '매우 어려움';
}

function getWeightRange(fish: { minSize: number; maxSize: number; baseWeight: number }) {
  const minWeight = Math.round(fish.baseWeight * 0.5);
  const maxWeight = Math.round(fish.baseWeight * 1.5 * (fish.maxSize / fish.minSize));
  if (maxWeight >= 1000) {
    return `${(minWeight / 1000).toFixed(1)}~${(maxWeight / 1000).toFixed(1)}kg`;
  }
  return `${minWeight}~${maxWeight}g`;
}

export default async function FishDetailPage({ params }: PageProps) {
  const { fishId } = await params;
  const fish = findFish(fishId);
  if (!fish) notFound();

  const totalCatchWeight = RIVER_FISH.reduce((sum, f) => sum + f.catchWeight, 0);
  const catchPercent = ((fish.catchWeight / totalCatchWeight) * 100).toFixed(1);
  const diffPercent = Math.round(fish.difficulty * 100);

  // Schema.org 구조화 데이터
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${fish.name} - 낚시 도감`,
    description: fish.description,
    author: { '@type': 'Organization', name: SITE_CONFIG.name },
    publisher: { '@type': 'Organization', name: SITE_CONFIG.name },
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="mx-auto max-w-2xl px-4 pb-24 pt-12">
        {/* 브레드크럼 */}
        <nav className="mb-6 text-sm text-slate-400">
          <Link href="/fishing" className="hover:text-sky-400 transition-colors">낚시 게임</Link>
          <span className="mx-2">/</span>
          <Link href="/fishing/guide" className="hover:text-sky-400 transition-colors">도감</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-200">{fish.name}</span>
        </nav>

        {/* 헤더 */}
        <header className="mb-8">
          <div className="flex items-center gap-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl"
              style={{ backgroundColor: fish.color + '33' }}
            >
              🐟
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">{fish.name}</h1>
                <span
                  className="rounded-full px-3 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: GRADE_COLORS[fish.grade] + '22',
                    color: GRADE_COLORS[fish.grade],
                  }}
                >
                  {GRADE_NAMES[fish.grade]}
                </span>
              </div>
              <p className="mt-1 text-slate-400">{fish.description}</p>
            </div>
          </div>
        </header>

        {/* 기본 정보 */}
        <section className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-lg font-semibold">기본 정보</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">크기 범위</dt>
              <dd className="mt-0.5 font-medium">{fish.minSize}~{fish.maxSize}cm</dd>
            </div>
            <div>
              <dt className="text-slate-500">무게 범위</dt>
              <dd className="mt-0.5 font-medium">{getWeightRange(fish)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">출현 확률</dt>
              <dd className="mt-0.5 font-medium">{catchPercent}%</dd>
            </div>
            <div>
              <dt className="text-slate-500">등급</dt>
              <dd className="mt-0.5 font-medium" style={{ color: GRADE_COLORS[fish.grade] }}>
                {GRADE_NAMES[fish.grade]}
              </dd>
            </div>
          </dl>
        </section>

        {/* 챌린지 난이도 */}
        <section className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-lg font-semibold">챌린지 난이도</h2>
          <div className="mb-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">난이도</span>
              <span className="font-medium">{getDifficultyLabel(fish.difficulty)} ({diffPercent}%)</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${diffPercent}%`,
                  backgroundColor: GRADE_COLORS[fish.grade],
                }}
              />
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-400">
            <p>입질 대기 시간: {fish.waitTimeRange[0]}~{fish.waitTimeRange[1]}초</p>
            <p className="mt-1">
              난이도가 높을수록 챌린지 게이지의 성공 구간이 좁고 속도가 빨라집니다.
            </p>
          </div>
        </section>

        {/* 낚시 팁 */}
        <section className="mb-8 rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6">
          <h2 className="mb-4 text-lg font-semibold">낚시 팁</h2>
          <ul className="space-y-2 text-sm text-slate-300">
            {fish.difficulty >= 0.7 && (
              <li>• 챌린지 게이지가 매우 빠릅니다. 성공 구간 중앙을 노리세요.</li>
            )}
            {fish.waitTimeRange[1] >= 30 && (
              <li>• 입질 대기 시간이 길어 인내심이 필요합니다.</li>
            )}
            {fish.catchWeight <= 3 && (
              <li>• 출현 확률이 매우 낮습니다. 여러 번 시도해야 합니다.</li>
            )}
            <li>• 입질이 오면 {fish.waitTimeRange[0]}~{fish.waitTimeRange[1]}초 내에 반응해야 합니다.</li>
            <li>• 낚시 포인트 근처에서 Space 또는 화면 터치로 캐스팅하세요.</li>
          </ul>
        </section>

        {/* 네비게이션 */}
        <div className="flex gap-3">
          <Link
            href="/fishing/guide"
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm transition-colors hover:border-slate-500"
          >
            도감으로 돌아가기
          </Link>
          <Link
            href="/fishing"
            className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            지금 낚으러 가기
          </Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
