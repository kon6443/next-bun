import { cardStyles } from "@/styles/teams";
import { serializeJsonLd } from "@/app/utils/jsonLd";

type GameAboutProps = {
  /** 소개 제목 — "테트리스 소개" */
  title: string;
  /** 소개 문단 */
  paragraphs: readonly string[];
  features: readonly string[];
  /** 구조화 데이터(JSON-LD) — 같은 섹션에 둔다 */
  jsonLd?: object;
};

/**
 * 게임 소개·특징 — 서버 HTML에 검색엔진이 읽을 글을 남긴다(캔버스·클라이언트 화면만으로는 내용이 없다)
 * 게임 화면 맨 아래에 둬서 플레이를 방해하지 않는다
 */
export function GameAbout({ title, paragraphs, features, jsonLd }: GameAboutProps) {
  return (
    <section className={`${cardStyles.section} p-5`} aria-labelledby="game-about-title" data-testid="game-about">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
      <h2 id="game-about-title" className="text-base font-semibold text-white">
        {title}
      </h2>
      {paragraphs.map((text) => (
        <p key={text} className="mt-2 text-sm leading-relaxed text-slate-400">
          {text}
        </p>
      ))}
      <ul role="list" className="mt-3 grid gap-1.5 text-sm text-slate-300">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <span aria-hidden="true" className="text-sky-400">
              ·
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
