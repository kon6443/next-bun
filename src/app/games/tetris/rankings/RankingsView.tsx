"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RankingsView } from "@/app/games/_shared/components/RankingsView";
import { HallOfFame } from "@/app/games/_shared/components/HallOfFame";
import { getGameBoards, getGameScore } from "@/services/gameService";
import type { GameBoard, ScoreSummary } from "@/types/game";
import { formatScore } from "@/app/games/_shared/lib/format";
import { challengePath, challengeRootId } from "../lib/challenge";
import { TETRIS_GAME } from "../lib/game";
import { DAILY_PLAY_PATH, DAILY_REPLAY_DELAY_MS, dailyBoards, dailyDateLabel, dailyReplayState, isDailyBoardKey } from "../lib/daily";

type Props = {
  highlightId: number | null;
  /** ?board= — "daily"(오늘 데일리)·daily-YYYY-MM-DD·challenge-{원본 id}(도전장), 없으면 기본 랭킹 */
  boardParam: string | null;
};

/**
 * 테트리스 랭킹 — 기본 랭킹 + 오늘의 테트리스(데일리 보드) 탭 (games-growth B1)
 * 사양(함수 포함)은 서버 page에서 넘길 수 없어 클라이언트 래퍼에서 넘긴다
 * 데일리 탭은 /boards에 데일리 보드가 있을 때만(서버 비밀값이 없으면 데일리가 없다). 데일리는 기간 탭 없이 그날 하나
 * 도전장 보드(challenge-{원본 id}, B2)는 도전장 결과의 "랭킹 보기"로만 온다 — 기간 탭 없이, 머리에 원본 기록
 */
export default function TetrisRankingsView({ highlightId, boardParam }: Props) {
  const [boards, setBoards] = useState<GameBoard[] | null>(null);
  const [boardsFailed, setBoardsFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getGameBoards("tetris")
      .then(({ data }) => !cancelled && setBoards(data.items))
      .catch(() => !cancelled && setBoardsFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // 도전장 보드 — 원본 기록을 머리에 보인다
  const challengeRoot = boardParam ? challengeRootId(boardParam) : null;
  const [fetchedOriginal, setOriginal] = useState<ScoreSummary | null>(null);
  // 다른 도전장 보드로 바뀐 직후 한 번 그려질 때도 이전 원본을 보이지 않게 — 지금 보드의 원본일 때만
  const original = fetchedOriginal?.scoreId === challengeRoot ? fetchedOriginal : null;
  useEffect(() => {
    setOriginal(null);
    if (challengeRoot === null) return;
    let cancelled = false;
    getGameScore("tetris", challengeRoot)
      .then(({ data }) => !cancelled && setOriginal(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challengeRoot]);

  const dailies = dailyBoards(boards);
  const today = dailies.find((board) => board.current) ?? null;
  // "daily" 별칭은 /boards를 받아야 어느 날인지 안다 — 그 전엔 화면 틀만
  if (boardParam === "daily" && boards === null && !boardsFailed) {
    return <RankingsView key="waiting" game={TETRIS_GAME} highlightId={highlightId} showPeriods={false} waiting />;
  }
  const selected =
    challengeRoot !== null ? boardParam : boardParam === "daily" ? (today?.boardKey ?? null) : boardParam && isDailyBoardKey(boardParam) ? boardParam : null;
  const selectedBoard =
    selected && challengeRoot === null ? (dailies.find((board) => board.boardKey === selected) ?? { boardKey: selected, current: false, endsAt: null }) : null;
  const replayState = selectedBoard ? dailyReplayState(selectedBoard, Date.now()) : "open";
  const replayUnavailable = replayState === "running" ? "하루가 끝나고 2시간 뒤 공개돼요" : replayState === "soon" ? "곧 공개돼요(하루가 끝나고 2시간 뒤)" : null;

  const tabs = [{ boardKey: null as string | null, label: "전체 랭킹" }, ...[...dailies].sort((a, b) => Number(b.current) - Number(a.current)).map((board) => ({ boardKey: board.boardKey as string | null, label: board.current ? `오늘의 테트리스 ${dailyDateLabel(board.boardKey)}` : `${dailyDateLabel(board.boardKey)} 데일리` }))];
  const header =
    tabs.length > 1 || selected ? (
      <>
        {challengeRoot !== null && (
          <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm" data-testid="challenge-board">
            <p className="font-semibold text-white">⚔️ 도전장 순위</p>
            <p className="mt-0.5 text-slate-300">
              {original ? `${original.playerName}님의 ${formatScore(original.score)}점에 도전한 기록이에요.` : "같은 블록 순서로 겨룬 도전장 기록이에요."}
            </p>
            <Link href={challengePath(challengeRoot)} className="mt-2 inline-flex min-h-11 items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-slate-100">
              직접 도전
            </Link>
          </div>
        )}
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
        {replayUnavailable && selected && <p className="mt-2 text-xs text-slate-500">{dailyDateLabel(selected)} 데일리 리플레이는 하루가 끝나고 2시간 뒤 공개돼요.</p>}
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
      playHref={challengeRoot !== null ? challengePath(challengeRoot) : selected ? DAILY_PLAY_PATH : undefined}
      // 명예의 전당 — 지난 주간(기본 보드, 리플레이 바로 공개)·지난 데일리(그날 끝 + 2시간 뒤 공개) (games-growth B5)
      footer={<HallOfFame game={TETRIS_GAME} replayDelayMs={{ daily: DAILY_REPLAY_DELAY_MS }} />}
    />
  );
}
