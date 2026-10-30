"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink, EmptyState, LoadingSpinnerSimple } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import type { BattleMatchListItem } from "@/services/tetrisBattleService";
import { loadBattleMatchList } from "../lib/battleMatchLoader";
import { BattleMatchRow } from "./BattleMatchRow";

const RECENT_LIMIT = 5;

type RecentState = { status: "loading" } | { status: "error" } | { status: "ready"; items: BattleMatchListItem[]; now: number };

/**
 * 테트리스 홈 "최근 대전" (DESIGN §19) — 저장된 최근 경기(limit, 기본 5 · 홈 기록 탭은 3), 전체 목록으로
 * bare: 카드·제목·전체 보기 없이 목록만(테트리스 홈 기록 탭 안 — 전체 보기는 탭 아래 링크)
 */
export function RecentBattles({ bare = false, limit = RECENT_LIMIT }: { bare?: boolean; limit?: number } = {}) {
  const [state, setState] = useState<RecentState>({ status: "loading" });
  /** "다시 시도" — 바뀌면 다시 받는다 */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    loadBattleMatchList(limit, null)
      .then(({ items }) => {
        if (!cancelled) setState({ status: "ready", items, now: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, limit]);

  const body =
    state.status === "loading" ? (
      <LoadingSpinnerSimple message="최근 대전을 불러오는 중..." />
    ) : state.status === "error" ? (
      <div className="flex items-center justify-between gap-3">
        <p role="alert" className="text-sm text-red-300">
          최근 대전을 불러오지 못했어요.
        </p>
        <Button type="button" variant="secondary" size="sm" className="min-h-11" onClick={() => setAttempt((n) => n + 1)}>
          다시 시도
        </Button>
      </div>
    ) : state.items.length === 0 ? (
      <EmptyState message="아직 저장된 대전이 없어요." description="친구와 첫 대전을 해 보세요!" variant="minimal" />
    ) : (
      <ul className="-mx-2">
        {state.items.map((item) => (
          <BattleMatchRow key={item.matchId} item={item} now={state.now} />
        ))}
      </ul>
    );
  if (bare) return <div data-testid="recent-battles">{body}</div>;
  return (
    <section className={`${cardStyles.section} p-4`} aria-labelledby="recent-battles-title">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="recent-battles-title" className="text-base font-semibold text-white">
          최근 대전
        </h2>
        <ButtonLink href="/games/tetris/battle/matches" variant="secondary" size="md">
          전체 보기
        </ButtonLink>
      </div>
      {body}
    </section>
  );
}
