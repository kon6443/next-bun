"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RankingsView } from "@/app/games/_shared/components/RankingsView";
import { getGameBoards } from "@/services/gameService";
import type { GameBoard } from "@/types/game";
import { DEFENSE_GAME, REPLAY_PLAYER_READY } from "../lib/defenseGame";
import { boardTabs, selectBoard, weeklyReplayState } from "../lib/rankedBoards";

/**
 * 디펜스 랭킹 (defense DESIGN §F1 랭킹·§B6·D-024·D-027) — /boards로 탭: 무한(시즌 — 일간·주간·전체) · 주간(이번 주·지난 주 — 기간 탭 없음)
 * 랭킹 보기는 해금과 무관하게 누구나. 주간 보드 리플레이는 주 종료 4시간(세션 TTL) 뒤 공개(그 전 서버 404 — D-027·D-032)
 */
type Props = { boardParam: string | null; highlightId: number | null };

export function DefenseRankings({ boardParam, highlightId }: Props) {
  const [boards, setBoards] = useState<GameBoard[] | null>(null);
  const [boardsError, setBoardsError] = useState(false);
  useEffect(() => {
    getGameBoards("defense")
      .then(({ data }) => setBoards(data.items))
      .catch(() => setBoardsError(true));
  }, []);

  // 목록을 받기 전에는 별칭(weekly)이 어느 주인지 모른다 — 받은 뒤에 랭킹을 부른다(목록 실패면 무한 기본)
  const ready = boards !== null || boardsError;
  const tabs = boardTabs(boards);
  const board = selectBoard(tabs, boardParam);
  const selected = tabs.find((t) => t.boardKey === board) ?? null;
  const weekly = board.startsWith("weekly-");
  // 주간 리플레이는 주 끝 + 4시간(세션 TTL) 뒤 공개(D-032) — /boards endsAt, 목록에 없으면 보드 키로 판정
  // 서버가 지금 등록받는 주(current)라고 하면 기기 시계와 상관없이 진행 중 — 시계가 빠른 기기에서 일찍 열리지 않게
  const replayState = !weekly ? "open" : selected?.current ? "running" : weeklyReplayState(board, selected?.endsAt, Date.now());
  const runningWeekly = replayState === "running";
  const replayUnavailable =
    replayState === "running" ? "주가 끝나고 4시간 뒤 공개돼요" : replayState === "soon" ? "곧 공개돼요(주 종료 4시간 뒤)" : REPLAY_PLAYER_READY ? null : "리플레이는 준비 중이에요";

  const header = (
    <>
      <nav aria-label="랭킹 보드" className="mt-4 flex flex-wrap gap-1.5" data-testid="defense-board-tabs">
        {tabs.map((tab) => (
          <Link
            key={tab.boardKey}
            replace
            scroll={false}
            href={`/games/defense/rankings?board=${tab.boardKey}`}
            aria-current={tab.boardKey === board ? "page" : undefined}
            data-testid={`defense-board-tab-${tab.boardKey}`}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${tab.boardKey === board ? "border-sky-400/60 bg-sky-500/30 text-white" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {boardsError && <p className="mt-2 text-xs text-slate-500">보드 목록을 불러오지 못해 무한 모드 랭킹만 보여요.</p>}
      {runningWeekly && <p className="mt-2 text-xs text-slate-500">진행 중인 주간 도전 — 리플레이는 주가 끝나고 4시간 뒤 공개돼요.</p>}
      {replayState === "soon" && <p className="mt-2 text-xs text-slate-500">막 끝난 주 — 리플레이는 주 종료 4시간 뒤 공개돼요.</p>}
    </>
  );

  if (!ready) return null;
  return (
    <RankingsView
      // 보드를 바꾸면 기간 탭·목록을 새로(이전 보드 응답이 섞이지 않게)
      key={board}
      game={DEFENSE_GAME}
      highlightId={highlightId}
      board={board}
      showPeriods={!weekly}
      header={header}
      replayUnavailable={replayUnavailable}
      playHref={weekly ? "/games/defense/play/weekly" : "/games/defense/play/endless"}
    />
  );
}
