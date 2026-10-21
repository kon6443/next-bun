"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, ButtonLink } from "@/app/teams/components";
import { getGameRankings, submitGameScore } from "@/services/gameService";
import type { RankingPeriod, ReplayPayload, SubmitScoreResponse } from "@/types/game";
import { estimateRank, formatFrames, formatScore } from "../lib/format";
import { classifySubmitError } from "../lib/submitError";
import { PLAYER_NAME_MAX_LENGTH, normalizePlayerName, playerNameLength, validatePlayerName } from "../lib/playerName";
import {
  addMyScoreId,
  removePendingSubmission,
  saveLastName,
  savePendingSubmission,
} from "../lib/storage";

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
  onRestart: () => void;
};

const PERIODS: { key: RankingPeriod; label: string }[] = [
  { key: "daily", label: "오늘" },
  { key: "weekly", label: "이번 주" },
  { key: "all", label: "전체" },
];
const ESTIMATE_LIMIT = 100;

/** 예상 순위: 숫자 = 예상 순위, null = 상위 100개 밖, "unavailable" = 조회 실패(429 등) */
type Estimate = number | null | "unavailable";
type Estimates = Partial<Record<RankingPeriod, Estimate>>;

/**
 * 순위 표시 — 등록 후에는 서버 순위(순위 계산만 실패해 ranks가 null이면 "확인 중"), 등록 전에는 예상
 * 예상: undefined = 불러오는 중
 */
function rankLabel(registered: SubmitScoreResponse | null, estimate: Estimate | undefined, period: RankingPeriod): string {
  if (registered) return registered.ranks ? `${registered.ranks[period]}위` : "확인 중";
  if (estimate === undefined) return "…";
  if (estimate === "unavailable") return "—";
  return estimate === null ? "100위 밖" : `예상 ${estimate}위`;
}

export function GameOverPanel({
  result,
  replay,
  sessionId,
  sessionError,
  accessToken,
  defaultName,
  onRestart,
}: GameOverPanelProps) {
  const [name, setName] = useState(defaultName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [isFinalError, setIsFinalError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [registered, setRegistered] = useState<SubmitScoreResponse | null>(null);
  const [estimates, setEstimates] = useState<Estimates>({});
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 패널이 뜨면 포커스를 옮긴다 (키보드·스크린리더 사용자가 결과를 바로 읽게)
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // 등록 전 예상 순위 (상위 100개 기준) — 등록 후에는 서버가 준 순위를 쓴다
  // 패널(=게임 오버)당 정확히 기간별 1회: StrictMode·Fast Refresh가 effect를 다시 돌려도 ref 가드로 재요청하지 않는다
  // (요청을 취소하지 않으므로 첫 실행의 응답이 그대로 반영된다. 전역 스로틀(초당 5)에 걸리지 않게)
  const estimatesRequestedRef = useRef(false);
  useEffect(() => {
    if (estimatesRequestedRef.current) return;
    estimatesRequestedRef.current = true;
    const myScore = result.score;
    for (const { key } of PERIODS) {
      getGameRankings("tetris", key, ESTIMATE_LIMIT)
        .then(({ data }) => {
          const scores = data.items.map((item) => item.score);
          setEstimates((prev) => ({
            ...prev,
            [key]: estimateRank(scores, myScore, data.items.length < ESTIMATE_LIMIT),
          }));
        })
        .catch(() => {
          // 예상 순위는 참고용 — 실패(429 등)하면 재시도하지 않고 "—"
          setEstimates((prev) => ({ ...prev, [key]: "unavailable" }));
        });
    }
  }, [result.score]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || submittingRef.current || registered) return;
    const message = validatePlayerName(name);
    if (message) {
      setNameError(message);
      return;
    }
    const playerName = normalizePlayerName(name);
    submittingRef.current = true;
    setIsSubmitting(true);
    setNameError(null);
    setSubmitError(null);
    try {
      const { data } = await submitGameScore("tetris", { sessionId, playerName, replay }, accessToken);
      setRegistered(data);
      addMyScoreId(data.scoreId);
      saveLastName(playerName);
      removePendingSubmission(sessionId);
    } catch (err) {
      const { kind, message: text } = classifySubmitError(err, canRetry);
      if (kind === "name") {
        setNameError(text);
      } else if (kind === "final") {
        setSubmitError(text);
        setIsFinalError(true);
        removePendingSubmission(sessionId);
      } else {
        // 네트워크·429·5xx — 결과를 보관하고 다시 시도할 수 있게
        setSubmitError(text);
        setCanRetry(true);
        savePendingSubmission({ sessionId, playerName, replay, score: result.score, savedAt: Date.now() });
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-5 text-center shadow-[0_30px_60px_rgba(2,6,23,0.7)]">
      <h2 ref={titleRef} tabIndex={-1} className="text-xs font-semibold tracking-[0.4em] text-slate-400 focus:outline-none">
        GAME OVER
      </h2>
      <p className="mt-3 text-4xl font-bold text-white">{formatScore(registered?.score ?? result.score)}</p>
      {result.isNewBest && <p className="mt-1 text-sm font-semibold text-amber-300">개인 최고 기록!</p>}
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
      </dl>

      {/* 순위 — 등록 전에는 예상, 등록 후에는 서버 순위 */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm">
        {PERIODS.map(({ key, label }) => (
          <div key={key}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-0.5 font-semibold text-slate-100">{rankLabel(registered, estimates[key], key)}</p>
          </div>
        ))}
      </div>

      {registered ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-sm font-semibold text-emerald-300">랭킹에 등록했어요.</p>
          <ButtonLink href={`/games/tetris/replays/${registered.scoreId}`} variant="secondary" size="md" fullWidth>
            ▶ 내 플레이 다시보기
          </ButtonLink>
          <ButtonLink href={`/games/tetris/rankings?highlight=${registered.scoreId}`} variant="secondary" size="md" fullWidth>
            랭킹 보기
          </ButtonLink>
        </div>
      ) : sessionId && !isFinalError ? (
        <form onSubmit={handleSubmit} className="mt-5 text-left" noValidate>
          <label htmlFor="tetris-player-name" className="mb-1.5 block text-sm font-semibold text-slate-300">
            랭킹에 올릴 이름
          </label>
          <input
            id="tetris-player-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            maxLength={PLAYER_NAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            aria-invalid={nameError ? true : undefined}
            aria-describedby="tetris-player-name-help"
            disabled={isSubmitting}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-base text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            placeholder="이름 (1~12자)"
          />
          <p id="tetris-player-name-help" className={`mt-1 text-xs ${nameError ? "text-red-400" : "text-slate-500"}`}>
            {nameError ?? `${playerNameLength(normalizePlayerName(name))}/${PLAYER_NAME_MAX_LENGTH} · 한글·영문·숫자·공백·_·-`}
          </p>
          {submitError && (
            <p role="alert" className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-sm text-red-300">
              {submitError}
            </p>
          )}
          <Button type="submit" size="md" fullWidth className="mt-3 min-h-11" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "등록 중..." : canRetry ? "다시 등록하기" : "랭킹 등록"}
          </Button>
        </form>
      ) : (
        <p role="status" className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
          {submitError ?? sessionError ?? "이번 판은 랭킹에 등록할 수 없어요."}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Button type="button" size="md" className="min-h-11 flex-1" onClick={onRestart}>
          다시 하기
        </Button>
        <Link
          href="/games/tetris"
          className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40"
        >
          나가기
        </Link>
      </div>
    </div>
  );
}
