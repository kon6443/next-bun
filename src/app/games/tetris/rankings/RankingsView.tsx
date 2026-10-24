"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RankingsView } from "@/app/games/_shared/components/RankingsView";
import { getGameBoards } from "@/services/gameService";
import type { GameBoard } from "@/types/game";
import { TETRIS_GAME } from "../lib/game";
import { DAILY_PLAY_PATH, dailyBoards, dailyDateLabel, dailyReplayState, isDailyBoardKey } from "../lib/daily";

type Props = {
  highlightId: number | null;
  /** ?board= — "daily"(오늘 데일리) 또는 daily-YYYY-MM-DD, 없으면 기본 랭킹 */
  boardParam: string | null;
};

/**
 * 테트리스 랭킹 — 기본 랭킹 + 오늘의 테트리스(데일리 보드) 탭 (games-growth B1)
 * 사양(함수 포함)은 서버 page에서 넘길 수 없어 클라이언트 래퍼에서 넘긴다
 * 데일리 탭은 /boards에 데일리 보드가 있을 때만(서버 비밀값이 없으면 데일리가 없다). 데일리는 기간 탭 없이 그날 하나
 */
export default function TetrisRankingsView({ highlightId, boardParam }: Props) {
  const [boards, setBoards] = useState<GameBoard[] | null>(null);
  const [boardsFailed, setBoardsFailed] = useState(false);
  useEffect(() => {
    getGameBoards("tetris")
      .then(({ data }) => setBoards(data.items))
      .catch(() => setBoardsFailed(true));
  }, []);

  const dailies = dailyBoards(boards);
  const today = dailies.find((board) => board.current) ?? null;
  // "daily" 별칭은 /boards를 받아야 어느 날인지 안다 — 그 전엔 화면 틀만
  if (boardParam === "daily" && boards === null && !boardsFailed) {
    return <RankingsView key="waiting" game={TETRIS_GAME} highlightId={highlightId} showPeriods={false} waiting />;
  }
  const selected = boardParam === "daily" ? (today?.boardKey ?? null) : boardParam && isDailyBoardKey(boardParam) ? boardParam : null;
  const selectedBoard = selected ? (dailies.find((board) => board.boardKey === selected) ?? { boardKey: selected, current: false, endsAt: null }) : null;
  const replayState = selectedBoard ? dailyReplayState(selectedBoard, Date.now()) : "open";
  const replayUnavailable = replayState === "running" ? "하루가 끝나고 2시간 뒤 공개돼요" : replayState === "soon" ? "곧 공개돼요(하루가 끝나고 2시간 뒤)" : null;

  const tabs = [{ boardKey: null as string | null, label: "전체 랭킹" }, ...[...dailies].sort((a, b) => Number(b.current) - Number(a.current)).map((board) => ({ boardKey: board.boardKey as string | null, label: board.current ? `오늘의 테트리스 ${dailyDateLabel(board.boardKey)}` : `${dailyDateLabel(board.boardKey)} 데일리` }))];
  const header =
    tabs.length > 1 || selected ? (
      <>
        <nav aria-label="랭킹 보드" className="mt-4 flex flex-wrap gap-1.5" data-testid="tetris-board-tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.boardKey ?? "default"}
              replace
              scroll={false}
              href={tab.boardKey ? `/games/tetris/rankings?board=${tab.boardKey}` : "/games/tetris/rankings"}
              aria-current={tab.boardKey === selected ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${tab.boardKey === selected ? "border-sky-400/60 bg-sky-500/30 text-white" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {replayUnavailable && <p className="mt-2 text-xs text-slate-500">오늘의 테트리스 리플레이는 하루가 끝나고 2시간 뒤 공개돼요.</p>}
      </>
    ) : null;

  return (
    <RankingsView
      // 보드를 바꾸면 기간·정렬·목록을 새로(이전 보드 응답이 섞이지 않게)
      key={selected ?? "default"}
      game={TETRIS_GAME}
      highlightId={highlightId}
      board={selected ?? undefined}
      showPeriods={!selected}
      header={header}
      replayUnavailable={replayUnavailable}
      playHref={selected ? DAILY_PLAY_PATH : undefined}
    />
  );
}
