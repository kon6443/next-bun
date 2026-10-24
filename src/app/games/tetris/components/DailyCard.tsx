"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/app/teams/components";
import { cardStyles } from "@/styles/teams";
import { getGameBoards } from "@/services/gameService";
import { formatScore } from "@/app/games/_shared/lib/format";
import { DAILY_PLAY_PATH, type DailyFirstRun, dailyBoards, dailyDateLabel, loadDailyFirstRun } from "../lib/daily";
import { DailyShareButton } from "./DailyShareButton";

/**
 * 테트리스 홈 맨 위 "오늘의 테트리스" (games-growth B1) — 오늘 데일리 보드가 있을 때만(서버 비밀값이 없으면 숨김)
 * 오늘 이미 했으면 첫 판 기록·공유·다시 도전, 아니면 도전하기
 */
export function DailyCard() {
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
  return (
    <section className={`${cardStyles.section} border-emerald-400/30 p-5`} aria-labelledby="tetris-daily-title" data-testid="tetris-daily">
      <p className="text-xs font-semibold tracking-[0.3em] text-emerald-300">DAILY · {dailyDateLabel(boardKey)}</p>
      <h2 id="tetris-daily-title" className="mt-1 text-xl font-bold text-white">
        오늘의 테트리스
      </h2>
      <p className="mt-1 text-sm text-slate-400">오늘은 모두 같은 블록 순서예요. 같은 판으로 겨루고 결과를 공유해 보세요.</p>
      {first ? (
        <>
          <p className="mt-3 text-sm text-slate-200" data-testid="tetris-daily-first">
            오늘 첫 판 <span className="font-bold text-white">{formatScore(first.score)}점</span>
            {first.rank ? ` · ${first.rank}위` : ""}
          </p>
          <div className="mt-3 grid gap-2">
            <DailyShareButton boardKey={boardKey} />
            <div className="grid grid-cols-2 gap-2">
              <ButtonLink href={DAILY_PLAY_PATH} variant="secondary" size="md" fullWidth>
                다시 도전
              </ButtonLink>
              <ButtonLink href={`/games/tetris/rankings?board=${boardKey}`} variant="secondary" size="md" fullWidth>
                오늘 순위
              </ButtonLink>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <ButtonLink href={DAILY_PLAY_PATH} size="md" fullWidth>
            도전하기
          </ButtonLink>
          <ButtonLink href={`/games/tetris/rankings?board=${boardKey}`} variant="secondary" size="md" fullWidth>
            오늘 순위
          </ButtonLink>
        </div>
      )}
    </section>
  );
}
