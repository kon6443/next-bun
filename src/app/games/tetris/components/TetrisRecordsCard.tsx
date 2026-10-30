"use client";

import { type ReactNode, useId, useRef, useState } from "react";
import Link from "next/link";
import { cardStyles } from "@/styles/teams";
import { PopularReplaysPreview } from "@/app/games/_shared/components/PopularReplaysPreview";
import { RecentBattles } from "../battle-ui/components/RecentBattles";
import { TETRIS_GAME } from "../lib/game";
import { nextTabByKey } from "../lib/tabKeys";

const TABS = ["ranking", "replays", "battles"] as const;
/** 탭마다 보일 줄 수 — 홈은 미리보기라 3줄(tetris-home D-003), 나머지는 "전체 보기"에서 */
export const RECORDS_LIMIT = 3;
type RecordsTab = (typeof TABS)[number];

const TAB_LABELS: Record<RecordsTab, string> = {
  ranking: "오늘 랭킹",
  replays: "인기 리플레이",
  battles: "최근 대전",
};

/** 탭 아래 "전체 보기" — 인기 리플레이는 따로 목록이 없어 랭킹(▶로 재생)으로 */
const TAB_MORE: Record<RecordsTab, string> = {
  ranking: "/games/tetris/rankings",
  replays: "/games/tetris/rankings",
  battles: "/games/tetris/battle/matches",
};

type Props = {
  /** 오늘 랭킹 미리보기 — 홈이 받아 둔 것(등록 뒤 다시 받기 등 홈 상태와 함께 움직인다) */
  ranking: ReactNode;
  myScoreIds: ReadonlySet<number>;
  accessToken?: string;
  /** 로그인 상태가 정해졌는지 — 인기 리플레이를 익명·토큰으로 두 번 부르지 않게 */
  authReady: boolean;
};

/**
 * 테트리스 홈 기록 카드(tetris-home) — 오늘 랭킹·인기 리플레이·최근 대전을 탭 하나로(카드 세 장 → 한 장)
 * 처음은 오늘 랭킹. 다른 탭은 고를 때 처음 그린다(홈 진입 때 요청을 늘리지 않게) — 한 번 본 탭은 남겨 다시 오갈 때 다시 받지 않는다
 * 탭 키보드: ←·→·Home·End(스킨 탭과 같은 규칙)
 */
export function TetrisRecordsCard({ ranking, myScoreIds, accessToken, authReady }: Props) {
  const tabsId = useId();
  const [tab, setTab] = useState<RecordsTab>("ranking");
  const [visited, setVisited] = useState<ReadonlySet<RecordsTab>>(() => new Set<RecordsTab>(["ranking"]));
  const tabRefs = useRef<Partial<Record<RecordsTab, HTMLButtonElement | null>>>({});

  const select = (next: RecordsTab) => {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set([...prev, next])));
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    const next = nextTabByKey(TABS, tab, e.key);
    if (!next) return;
    e.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const panels: Record<RecordsTab, ReactNode> = {
    ranking,
    replays: <PopularReplaysPreview game={TETRIS_GAME} myScoreIds={myScoreIds} accessToken={accessToken} ready={authReady} limit={RECORDS_LIMIT} bare />,
    battles: <RecentBattles bare limit={RECORDS_LIMIT} />,
  };

  return (
    <section className={`${cardStyles.section} p-4`} data-testid="tetris-records">
      <div role="tablist" aria-label="기록" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-800/60 p-1" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t}
            ref={(el) => {
              tabRefs.current[t] = el;
            }}
            type="button"
            role="tab"
            id={`${tabsId}-${t}`}
            aria-selected={tab === t}
            // 아직 그리지 않은 탭은 가리킬 패널이 없다(처음 고를 때 그린다)
            aria-controls={visited.has(t) ? `${tabsId}-panel-${t}` : undefined}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => select(t)}
            className={`min-h-11 rounded-lg text-sm font-semibold ${tab === t ? "bg-sky-500/30 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {TABS.filter((t) => visited.has(t)).map((t) => (
        <div key={t} id={`${tabsId}-panel-${t}`} role="tabpanel" aria-labelledby={`${tabsId}-${t}`} hidden={tab !== t} className="mt-3">
          {panels[t]}
        </div>
      ))}
      <div className="mt-1 flex justify-end">
        <Link href={TAB_MORE[tab]} aria-label={`${TAB_LABELS[tab]} 전체 보기`} className="flex min-h-11 items-center px-1 text-sm text-sky-300 hover:text-sky-200">
          전체 보기<span aria-hidden="true">&nbsp;›</span>
        </Link>
      </div>
    </section>
  );
}
