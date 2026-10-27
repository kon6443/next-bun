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
  /** 접어 두기(테트리스 홈 — 자리만 차지하지 않게) — 글·JSON-LD는 접혀도 서버 HTML에 그대로 남아 검색엔진이 읽는다 */
  collapsible?: boolean;
};

/**
 * 게임 소개·특징 — 서버 HTML에 검색엔진이 읽을 글을 남긴다(캔버스·클라이언트 화면만으로는 내용이 없다)
 * 게임 화면 맨 아래에 둬서 플레이를 방해하지 않는다
 */
export function GameAbout({ title, paragraphs, features, jsonLd, collapsible = false }: GameAboutProps) {
  const body = (
    <>
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
    </>
  );
  if (collapsible) {
    return (
      // summary가 첫 자식(HTML 내용 모델), 제목은 summary 안에 글자로만 — summary 안 제목은 일부 스크린리더(VoiceOver)에서 펼침 버튼을 가린다
      <details className="group px-1" data-testid="game-about">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm text-slate-400 hover:text-slate-200 [&::-webkit-details-marker]:hidden">
          {title}
          <span aria-hidden="true" className="transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>
        {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
        <div className="pb-2">{body}</div>
      </details>
    );
  }
  return (
    <section className={`${cardStyles.section} p-5`} aria-labelledby="game-about-title" data-testid="game-about">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />}
      <h2 id="game-about-title" className="text-base font-semibold text-white">
        {title}
      </h2>
      {body}
    </section>
  );
}
