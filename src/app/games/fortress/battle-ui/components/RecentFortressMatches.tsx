"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink, EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { type FortressMatchListItem, getFortressMatchList } from "@/services/fortressService";
import { FORTRESS_MATCHES_PATH } from "../lib/fortressShare";
import { FortressMatchRow } from "./FortressMatchRow";

const RECENT_LIMIT = 5;

type RecentState = { status: "loading" } | { status: "error" } | { status: "ready"; items: FortressMatchListItem[]; now: number };

/** 포트리스 홈 "최근 경기" (F6) — 저장된 최근 온라인 경기 5개, 전체 목록으로 (테트리스 RecentBattles와 같은 모양) */
export function RecentFortressMatches() {
  const [state, setState] = useState<RecentState>({ status: "loading" });
  /** "다시 시도" — 바뀌면 다시 받는다 */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getFortressMatchList({ limit: RECENT_LIMIT })
      .then(({ data }) => {
        if (!cancelled) setState({ status: "ready", items: data.items, now: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <section className={`${cardStyles.section} p-4`} aria-labelledby="fortress-recent-title" data-testid="fortress-recent-matches">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="fortress-recent-title" className="text-base font-semibold text-white">
          최근 경기
        </h2>
        <ButtonLink href={FORTRESS_MATCHES_PATH} variant="secondary" size="md">
          전체 보기
        </ButtonLink>
      </div>
      {state.status === "loading" ? (
        <LoadingSpinnerSimple message="최근 경기를 불러오는 중..." />
      ) : state.status === "error" ? (
        <div className="flex items-center justify-between gap-3">
          <p role="alert" className="text-sm text-red-300">
            최근 경기를 불러오지 못했어요.
          </p>
          <Button type="button" variant="secondary" size="sm" className="min-h-11" onClick={() => setAttempt((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      ) : state.items.length === 0 ? (
        <EmptyState message="아직 저장된 경기가 없어요." description="친구와 첫 온라인 대전을 해 보세요!" variant="minimal" />
      ) : (
        <ul className="-mx-2">
          {state.items.map((item) => (
            <FortressMatchRow key={item.matchId} item={item} now={state.now} />
          ))}
        </ul>
      )}
    </section>
  );
}
