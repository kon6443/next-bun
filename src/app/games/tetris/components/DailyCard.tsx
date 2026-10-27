"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGameBoards } from "@/services/gameService";
import { formatScore } from "@/app/games/_shared/lib/format";
import { DAILY_PLAY_PATH, type DailyFirstRun, dailyBoards, dailyDateLabel, loadDailyFirstRun } from "../lib/daily";
import { DailyShareButton } from "./DailyShareButton";

/**
 * "오늘의 테트리스" (games-growth B1) — 테트리스 홈 플레이 카드 안, 게임 시작 아래의 보조 줄(tetris-home: 시작과 합침)
 * 오늘 데일리 보드가 있을 때만(서버 비밀값이 없으면 숨김). 오늘 이미 했으면 첫 판 기록·공유·다시 도전, 아니면 도전하기
 */
export function DailyCard({ className = "" }: { className?: string }) {
  const [boardKey, setBoardKey] = useState<string | null>(null);
  const [first, setFirst] = useState<DailyFirstRun | null>(null);
  useEffect(() => {
    let cancelled = false;
    getGameBoards("tetris")
      .then(({ data }) => {
        if (cancelled) return;
        const today = dailyBoards(data.items).find((board) => board.current);
        if (!today) return;
        setBoardKey(today.boardKey);
        setFirst(loadDailyFirstRun(today.boardKey));
      })
      // 보드 목록을 못 받으면 카드를 숨긴다 — 홈의 다른 영역은 그대로
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!boardKey) return null;
  const rankingHref = `/games/tetris/rankings?board=${boardKey}`;
  return (
    <section className={`rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-3 ${className}`} aria-labelledby="tetris-daily-title" data-testid="tetris-daily">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="tetris-daily-title" className="whitespace-nowrap text-sm font-semibold text-white">
            오늘의 테트리스
          </h2>
          {/* 날짜는 둘째 줄 앞 — 375에서 제목이 두 줄로 꺾이지 않게 */}
          <p className="truncate text-xs text-slate-400">
            <span className="font-semibold text-emerald-300">{dailyDateLabel(boardKey)}</span>
            {" · "}
            {first ? (
              <span className="text-slate-300" data-testid="tetris-daily-first">
                오늘 첫 판 <span className="font-bold text-white">{formatScore(first.score)}점</span>
                {first.rank ? ` · ${first.rank}위` : ""}
              </span>
            ) : (
              "같은 블록 순서로 겨뤄요"
            )}
          </p>
        </div>
        {!first && (
          <div className="flex shrink-0 items-center gap-1">
            <Link href={rankingHref} className="flex min-h-11 items-center px-2 text-xs text-emerald-200 hover:text-emerald-100">
              오늘 순위
            </Link>
            <Link
              href={DAILY_PLAY_PATH}
              className="flex min-h-11 items-center rounded-full border border-emerald-300/50 px-4 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/10"
            >
              도전하기
            </Link>
          </div>
        )}
      </div>
      {first && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <DailyShareButton boardKey={boardKey} compact />
          <Link href={DAILY_PLAY_PATH} className={DAILY_LINK}>
            다시 도전
          </Link>
          <Link href={rankingHref} className={DAILY_LINK}>
            오늘 순위
          </Link>
        </div>
      )}
    </section>
  );
}

const DAILY_LINK = "flex min-h-11 items-center justify-center whitespace-nowrap rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40";
