"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, EmptyState, LoadingSpinnerSimple, TeamsPageLayout } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { ReloginButton } from "@/app/games/_shared/components/ReloginButton";
import { isAuthExpired } from "@/app/games/_shared/lib/submitError";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { formatDayGroupLabel, formatTimeOfDay } from "@/app/utils/dateUtils";
import { type PointHistoryItem, getPointHistory } from "@/services/userService";
import type { SkinPoints } from "@/types/game";
import { formatPoints } from "../lib/points";
import { SKIN_ITEM_LABELS, SKIN_SLOT_LABELS, type SkinSlot } from "../lib/skins";

type Filter = "all" | "earn" | "spend";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "earn", label: "적립" },
  { key: "spend", label: "사용" },
];
const EMPTY_MESSAGES: Record<Filter, string> = {
  all: "아직 포인트 내역이 없어요.",
  earn: "아직 적립한 포인트가 없어요.",
  spend: "아직 사용한 포인트가 없어요.",
};

const PAGE_SIZE = 20;

type Load =
  | { status: "loading" }
  | { status: "ready"; points: SkinPoints; items: PointHistoryItem[]; nextCursor: number | null }
  | { status: "error"; message: string; expired: boolean };

/** +1,234 P · −100,000 P — 사용은 빼기 기호(−) */
export function formatSignedPoints(amount: number): string {
  return `${amount >= 0 ? "+" : "−"}${Math.abs(Math.trunc(amount)).toLocaleString("ko-KR")} P`;
}

const isSlot = (value: unknown): value is SkinSlot => value === "block" || value === "effect" || value === "board" || value === "background";

/** 줄 제목·리플레이 링크 — 사유별. 모르는 사유는 memo(없으면 "포인트") */
export function describePointItem(item: PointHistoryItem): { title: string; detail: string | null; replayHref: string | null } {
  const meta = item.meta ?? {};
  if (item.reason === "TETRIS_SCORE") {
    const scoreId = typeof meta.scoreId === "number" ? meta.scoreId : null;
    return { title: "테트리스 점수", detail: item.memo, replayHref: scoreId !== null ? `/games/tetris/replays/${scoreId}` : null };
  }
  if (item.reason === "SKIN_UPGRADE") {
    const { slot, skinId, level } = meta as { slot?: unknown; skinId?: unknown; level?: unknown };
    if (isSlot(slot) && typeof skinId === "string" && typeof level === "number") {
      return { title: `${SKIN_SLOT_LABELS[slot]} ${SKIN_ITEM_LABELS[skinId] ?? skinId} Lv${level} 강화`, detail: null, replayHref: null };
    }
    return { title: "스킨 강화", detail: item.memo, replayHref: null };
  }
  return { title: item.memo ?? "포인트", detail: null, replayHref: null };
}

/** 같은 날(로컬)끼리 묶는다 — 목록은 이미 시각 내림차순 */
function groupByDay(items: readonly PointHistoryItem[], now: Date): { label: string; items: PointHistoryItem[] }[] {
  const groups: { label: string; items: PointHistoryItem[] }[] = [];
  for (const item of items) {
    const label = formatDayGroupLabel(new Date(item.createdAt), now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/**
 * 테트리스 포인트 내역(tetris-home A) — 보유·적립·사용 요약 + 적립/사용 보기 + 날짜별 줄(점수 줄은 리플레이로)
 * 최신순 커서 페이지 — [더 보기]로 이어 받는다(무한 스크롤 대신 — 하단 내비와 겹치지 않고 키보드로도 닿게)
 * 보기를 바꾸면 처음부터 다시 받는다. 늦게 온 이전 보기의 응답은 버린다(요청 순번)
 * 로그인 전용 — 게스트는 로그인 안내, 401은 다시 로그인 안내
 */
export default function PointsHistoryView() {
  const { data: session, status: authStatus } = useSession();
  const accessToken = session?.user?.accessToken ?? null;
  const [filter, setFilter] = useState<Filter>("all");
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  /** 요청 순번 — 보기·토큰이 바뀌면 올려 이전 응답(첫 페이지·더 보기 모두)을 버린다 */
  const requestRef = useRef(0);

  useEffect(() => {
    if (authStatus === "loading" || !accessToken) return;
    const mine = ++requestRef.current;
    setLoad({ status: "loading" });
    setMoreError(null);
    setLoadingMore(false);
    getPointHistory({ limit: PAGE_SIZE, ...(filter === "all" ? {} : { type: filter }) }, accessToken)
      .then(({ data }) => {
        if (mine !== requestRef.current) return;
        setLoad({ status: "ready", points: data.points, items: data.items, nextCursor: data.nextCursor });
      })
      .catch((err) => {
        if (mine !== requestRef.current) return;
        setLoad({ status: "error", message: extractErrorMessage(err, "포인트 내역을 불러오지 못했습니다."), expired: isAuthExpired(err) });
      });
  }, [authStatus, accessToken, filter, attempt]);

  const loadMore = async () => {
    if (load.status !== "ready" || load.nextCursor === null || loadingMore || !accessToken) return;
    const mine = requestRef.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const { data } = await getPointHistory({ beforeId: load.nextCursor, limit: PAGE_SIZE, ...(filter === "all" ? {} : { type: filter }) }, accessToken);
      if (mine !== requestRef.current) return;
      setLoad((prev) =>
        prev.status === "ready" ? { status: "ready", points: data.points, items: [...prev.items, ...data.items], nextCursor: data.nextCursor } : prev,
      );
    } catch (err) {
      if (mine !== requestRef.current) return;
      // 로그인 만료면 다시 로그인 안내로(같은 토큰으로는 더 받아도 같다)
      if (isAuthExpired(err)) setLoad({ status: "error", message: "", expired: true });
      else setMoreError(extractErrorMessage(err, "더 불러오지 못했어요."));
    } finally {
      if (mine === requestRef.current) setLoadingMore(false);
    }
  };

  const now = new Date();

  return (
    <TeamsPageLayout>
      <header className="flex items-center gap-1">
        <Link
          href="/games/tetris"
          aria-label="테트리스 홈"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <span aria-hidden="true">‹</span>
        </Link>
        <h1 className="flex-1 text-2xl font-bold text-white">포인트 내역</h1>
      </header>

      {/* 게스트 — 세션은 있는데 토큰이 비어 있어도 부를 수 없으니 같은 안내(스피너에 머물지 않게) */}
      {authStatus === "unauthenticated" || (authStatus === "authenticated" && !accessToken) ? (
        <section className={`${cardStyles.section} p-5 text-sm text-slate-300`}>
          <p>로그인하면 테트리스 점수로 쌓인 포인트와 사용 내역을 볼 수 있어요.</p>
          <ReloginButton className="mt-3" label="카카오로 로그인" />
        </section>
      ) : (
        <>
          <section className={`${cardStyles.section} p-5`} aria-label="보유 포인트" data-testid="points-summary">
            <p className="text-xs text-slate-400">보유 포인트</p>
            <p className="mt-1 text-3xl font-bold text-amber-200">{load.status === "ready" ? formatPoints(load.points.balance) : load.status === "error" ? "-" : "…"}</p>
            {load.status === "ready" && (
              <p className="mt-1 text-xs text-slate-400">
                적립 {formatPoints(load.points.earned)} · 사용 {formatPoints(load.points.spent)}
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">로그인하고 남긴 테트리스 점수만큼 쌓이고, 스킨 강화에 써요.</p>
            <Link href="/games/tetris/skins" className="mt-1 inline-flex min-h-11 items-center text-sm text-sky-300 hover:text-sky-200">
              스킨 강화하러 가기<span aria-hidden="true">&nbsp;›</span>
            </Link>
          </section>

          <section className={`${cardStyles.section} p-4`} aria-label="내역">
            <div className="flex gap-2" role="group" aria-label="보기">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={`min-h-11 rounded-full border px-4 text-sm ${filter === f.key ? "border-sky-400 bg-sky-500/10 text-white" : "border-slate-700/50 text-slate-400"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {load.status === "loading" ? (
                <LoadingSpinnerSimple message="포인트 내역을 불러오는 중..." />
              ) : load.status === "error" ? (
                <div role="alert" className="text-sm text-red-300">
                  <p>{load.expired ? "로그인이 만료됐어요. 다시 로그인하면 내역을 볼 수 있어요." : load.message}</p>
                  {load.expired ? (
                    <ReloginButton className="mt-2" />
                  ) : (
                    <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-2 min-h-11 rounded-full border border-white/20 px-4 text-slate-200">
                      다시 시도
                    </button>
                  )}
                </div>
              ) : load.items.length === 0 ? (
                <EmptyState message={EMPTY_MESSAGES[filter]} description="테트리스를 하고 랭킹에 기록을 올리면 점수만큼 쌓여요." variant="minimal" />
              ) : (
                <div className="flex flex-col gap-4" data-testid="points-list">
                  {groupByDay(load.items, now).map((group) => (
                    <div key={`${group.label}-${group.items[0].id}`}>
                      <h2 className="px-1 text-xs font-semibold text-slate-400">{group.label}</h2>
                      <ul className="mt-1 flex flex-col">
                        {group.items.map((item) => (
                          <PointRow key={item.id} item={item} />
                        ))}
                      </ul>
                    </div>
                  ))}
                  {load.nextCursor !== null && (
                    <div>
                      {moreError && (
                        <p role="alert" className="mb-2 text-sm text-red-300">
                          {moreError}
                        </p>
                      )}
                      <Button type="button" variant="secondary" size="md" className="min-h-11 w-full" onClick={loadMore} disabled={loadingMore} aria-busy={loadingMore}>
                        {loadingMore ? "불러오는 중..." : "더 보기"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}
      <div aria-hidden="true" className="h-8" />
    </TeamsPageLayout>
  );
}

function PointRow({ item }: { item: PointHistoryItem }) {
  const { title, detail, replayHref } = describePointItem(item);
  const earned = item.amount >= 0;
  const content = (
    <>
      <span aria-hidden="true" className="w-6 shrink-0 text-center text-base">
        {item.reason === "TETRIS_SCORE" ? "🎮" : item.reason === "SKIN_UPGRADE" ? "✨" : "•"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-100">{title}</span>
        <span className="block truncate text-xs text-slate-500">
          {formatTimeOfDay(new Date(item.createdAt))}
          {detail ? ` · ${detail}` : ""}
          {replayHref ? " · 리플레이 보기" : ""}
        </span>
      </span>
      <span className={`shrink-0 text-sm font-semibold ${earned ? "text-emerald-300" : "text-orange-300"}`}>{formatSignedPoints(item.amount)}</span>
    </>
  );
  const rowClass = "flex min-h-14 items-center gap-3 rounded-xl px-1 py-2";
  return (
    <li data-testid={`points-item-${item.id}`}>
      {replayHref ? (
        <Link href={replayHref} className={`${rowClass} hover:bg-white/5`}>
          {content}
        </Link>
      ) : (
        <div className={rowClass}>{content}</div>
      )}
    </li>
  );
}
