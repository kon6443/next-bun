"use client";

import { useEffect } from "react";
import type { ReplayPayload, ScoreSummary, SubmitScoreResponse, TetrisScoreDetail } from "@/types/game";
import { ScoreSubmitPanel } from "@/app/games/_shared/components/ScoreSubmitPanel";
import { ResultShareButton } from "@/app/games/_shared/components/ResultShareButton";
import { formatFrames } from "@/app/games/_shared/lib/format";
import { TETRIS_GAME } from "../lib/game";
import { TETRIS_SHARE } from "../lib/share";
import { attachDailyRank, dailyDateLabel } from "../lib/daily";
import { DailyShareButton } from "./DailyShareButton";
import { ChallengeShareButton } from "./ChallengeShareButton";
import { formatScore } from "@/app/games/_shared/lib/format";

export type GameResult = {
  score: number;
  lines: number;
  level: number;
  frames: number;
  isNewBest: boolean;
};

type GameOverPanelProps = {
  result: GameResult;
  replay: ReplayPayload;
  /** 세션이 없으면(발급 실패) 등록할 수 없다 */
  sessionId: string | null;
  sessionError: string | null;
  accessToken?: string;
  defaultName: string;
  /** 오늘의 테트리스 판 — 순위는 그날 보드 하나, 다시보기는 다음 날 공개, 공유는 Wordle식 결과 문구 */
  daily?: { boardKey: string; isFirstRun: boolean } | null;
  /** 도전장 판 — 순위는 도전장 보드 하나, 원본과 점수 비교, 공유는 도전장 다시 보내기 (original: 아직 못 받았으면 null) */
  challenge?: { boardKey: string; original: ScoreSummary | null } | null;
  onRestart: () => void;
};

const DAILY_PERIODS = [{ key: "all", label: "오늘의 순위" }] as const;
const CHALLENGE_PERIODS = [{ key: "all", label: "도전장 순위" }] as const;

/** 테트리스 게임 오버 — 공용 등록 패널 + 줄·레벨·시간, 등록 뒤 기록 공유(상위권·개인 최고면 자랑 문구) */
export function GameOverPanel({ result, daily = null, challenge = null, ...rest }: GameOverPanelProps) {
  return (
    <ScoreSubmitPanel
      game={TETRIS_GAME}
      score={result.score}
      isNewBest={result.isNewBest}
      {...(daily ? { board: daily.boardKey, periods: DAILY_PERIODS, showReplay: false } : {})}
      {...(challenge ? { board: challenge.boardKey, periods: CHALLENGE_PERIODS } : {})}
      stats={
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-slate-500">줄</dt>
            <dd className="font-semibold text-slate-200">{result.lines}</dd>
          </div>
          <div>
            <dt className="text-slate-500">레벨</dt>
            <dd className="font-semibold text-slate-200">{result.level}</dd>
          </div>
          <div>
            <dt className="text-slate-500">시간</dt>
            <dd className="font-semibold text-slate-200">{formatFrames(result.frames)}</dd>
          </div>
          {challenge?.original && <ChallengeVersus original={challenge.original} score={result.score} />}
        </dl>
      }
      registeredActions={(registered, playerName, brag) =>
        daily ? (
          <DailyRegistered daily={daily} registered={registered} />
        ) : challenge?.original ? (
          <ChallengeShareButton original={challenge.original} myScore={registered.score} label="도전장 다시 보내기" className="w-full" />
        ) : (
          // 도전장 판인데 원본을 못 받았으면 일반 공유 — 도전장 보드 순위를 "전체 N위"로 자랑하지 않게 자랑 문구는 뺀다
          <ResultShareButton spec={TETRIS_SHARE} subject={{ scoreId: registered.scoreId, playerName, score: registered.score, detail: registered.detail }} brag={challenge ? null : brag} />
        )
      }
      {...rest}
    />
  );
}

/** 오늘의 테트리스 등록 뒤 — 첫 판이면 순위를 공유 문구에 붙이고 Wordle식 공유, 다시 도전한 판이면 첫 판 기준임을 알린다 */
function DailyRegistered({ daily, registered }: { daily: { boardKey: string; isFirstRun: boolean }; registered: SubmitScoreResponse<TetrisScoreDetail> }) {
  const rank = registered.ranks?.all ?? null;
  useEffect(() => {
    if (daily.isFirstRun) attachDailyRank(daily.boardKey, registered.scoreId, rank);
  }, [daily.isFirstRun, daily.boardKey, registered.scoreId, rank]);
  return (
    <>
      <p className="text-xs text-slate-400">
        {daily.isFirstRun ? `${dailyDateLabel(daily.boardKey)} 첫 판 기록으로 공유돼요.` : `다시 도전한 판이에요 — 공유는 ${dailyDateLabel(daily.boardKey)} 첫 판 기록으로 해요.`}
        {" "}리플레이는 {dailyDateLabel(daily.boardKey)} 하루가 끝나고 2시간 뒤 공개돼요.
      </p>
      <DailyShareButton boardKey={daily.boardKey} />
    </>
  );
}

/** 도전장 결과 — 원본 점수와 내 점수 (같은 블록 순서라 점수로 바로 비교) */
function ChallengeVersus({ original, score }: { original: ScoreSummary; score: number }) {
  const won = score > original.score;
  return (
    <div className="col-span-3 mt-2 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2" data-testid="challenge-versus">
      <dt className="text-xs text-slate-400">{original.playerName}님 {formatScore(original.score)}점 vs 나 {formatScore(score)}점</dt>
      <dd className={`mt-0.5 font-bold ${won ? "text-amber-300" : "text-slate-200"}`}>{won ? "도전 성공! 원본 기록을 넘었어요" : score === original.score ? "무승부 — 같은 점수예요" : `${formatScore(original.score - score)}점 모자라요`}</dd>
    </div>
  );
}
