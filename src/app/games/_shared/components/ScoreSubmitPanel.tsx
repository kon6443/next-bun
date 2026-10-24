"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { Button, ButtonLink } from "@/app/teams/components";
import { getGameRankings, submitGameScore } from "@/services/gameService";
import type { GameType, RankingPeriod, ReplayPayloadByGame, ScoreDetailByGame, SubmitScoreResponse } from "@/types/game";
import { estimateRank, formatScore } from "../lib/format";
import type { GameUiConfig } from "../lib/gameConfig";
import { classifySubmitError } from "../lib/submitError";
import { bragLabel } from "../lib/brag";
import { PLAYER_NAME_MAX_LENGTH, normalizePlayerName, playerNameLength, validatePlayerName } from "../lib/playerName";

type ScoreSubmitPanelProps<G extends GameType> = {
  game: GameUiConfig<G>;
  /** 엔진이 계산한 점수 — 등록하면 서버가 다시 계산한 점수로 바꿔 보인다 */
  score: number;
  isNewBest: boolean;
  /** 점수 아래 게임별 기록 요약 (줄·레벨·시간 등) */
  stats: React.ReactNode;
  replay: ReplayPayloadByGame[G];
  /** 등록할 보드 — 예상 순위 조회·랭킹 링크에 쓴다 (없으면 그 게임의 기본 보드 — 링크도 board 없이) */
  board?: string;
  /** 보일 순위 기간 — 기본 오늘·이번 주·전체. 보드 자체가 기간인 경우(디펜스 주간)는 하나만 */
  periods?: readonly { key: RankingPeriod; label: string }[];
  /** 등록 뒤 "내 플레이 다시보기" — 재생기가 아직 없는 게임은 false */
  showReplay?: boolean;
  /** 등록 뒤 링크 아래 게임별 동작(공유 등) — brag: 상위권·개인 최고면 자랑 문구(bragLabel), 아니면 null */
  registeredActions?: (registered: SubmitScoreResponse<ScoreDetailByGame[G]>, playerName: string, brag: string | null) => React.ReactNode;
  /** 세션이 없으면(발급 실패) 등록할 수 없다 */
  sessionId: string | null;
  sessionError: string | null;
  accessToken?: string;
  defaultName: string;
  onRestart: () => void;
  /** 다시 하기를 준비하는 중(다음 판 세션을 받는 중) — 버튼을 잠그고 "준비 중"으로 (games-polish FE-45) */
  restarting?: boolean;
};

const PERIODS: readonly { key: RankingPeriod; label: string }[] = [
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
function rankLabel(registered: SubmitScoreResponse<unknown> | null, estimate: Estimate | undefined, period: RankingPeriod): string {
  if (registered) return registered.ranks ? `${registered.ranks[period]}위` : "확인 중";
  if (estimate === undefined) return "…";
  if (estimate === "unavailable") return "—";
  return estimate === null ? "100위 밖" : `예상 ${estimate}위`;
}

/** 등록 뒤 랭킹 링크 — 보드가 있으면 그 보드 탭으로(board 생략 게임은 URL이 그대로) */
export function rankingsHref(rankingsPath: string, scoreId: number, board?: string): string {
  const params = new URLSearchParams({ highlight: String(scoreId) });
  if (board) params.set("board", board);
  return `${rankingsPath}?${params.toString()}`;
}

/** 게임 오버 패널 — 점수·예상 순위·이름 입력·등록·실패 보관(재시도) (게임별 요약은 stats로) */
export function ScoreSubmitPanel<G extends GameType>({
  game,
  score,
  isNewBest,
  stats,
  replay,
  board,
  periods = PERIODS,
  showReplay = true,
  registeredActions,
  sessionId,
  sessionError,
  accessToken,
  defaultName,
  onRestart,
  restarting = false,
}: ScoreSubmitPanelProps<G>) {
  const { gameType, storage } = game;
  /** 게임마다 고정 id — 테트리스는 공용화 전과 같은 "tetris-player-name" */
  const nameInputId = `${gameType}-player-name`;
  const [name, setName] = useState(defaultName);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // 이름 오류면 입력칸으로 돌아간다 — 제출 중 잠겼던 칸에서 포커스를 잃은 키보드 사용자가 다시 찾지 않게 (games-polish FE-30)
  useEffect(() => {
    if (nameError) nameInputRef.current?.focus();
  }, [nameError]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [isFinalError, setIsFinalError] = useState(false);
  /** 배포 뒤 옛 화면으로 낸 기록이라 거절됐다 — 새로고침 버튼 (ENGINE_VERSION) */
  const [needsReload, setNeedsReload] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [registered, setRegistered] = useState<SubmitScoreResponse<ScoreDetailByGame[G]> | null>(null);
  const [estimates, setEstimates] = useState<Estimates>({});
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 패널이 뜨면 포커스를 옮긴다 (키보드·스크린리더 사용자가 결과를 바로 읽게)
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // 게임 오버 순간 기록을 보관한다 — 이름 입력·등록 전에 새로고침·탭 닫기·뒤로가기를 해도 시작 화면에서 다시 등록할 수 있게 (games-polish FE-05)
  // 등록 성공·다시 내도 소용없는 거절이면 지우고, "다시 하기"·"나가기"를 직접 누르면 지운다(보관은 실수로 떠난 경우를 위한 것)
  // 이름은 아직 모른다 — 기본 이름(규칙을 통과하면)으로 두고, 비어 있으면 다시 등록할 때 이름부터 묻는다
  const presavedRef = useRef(false);
  useEffect(() => {
    if (!sessionId || presavedRef.current) return;
    presavedRef.current = true;
    const playerName = validatePlayerName(defaultName) === null ? normalizePlayerName(defaultName) : "";
    storage.savePendingSubmission({ sessionId, playerName, replay, score, savedAt: Date.now(), ...(board ? { board } : {}) });
  }, [sessionId, defaultName, replay, score, storage, board]);

  /** 다시 하면 이 판 기록이 사라지는 경우 — 등록 가능한 판을 아직 등록하지 않았고, 다시 등록할 보관도 없다 (games-polish FE-27) */
  const [confirmRestart, setConfirmRestart] = useState(false);
  const wouldLoseRecord = !!sessionId && !registered && !isFinalError && !canRetry;
  const restart = () => {
    discardPresaved();
    onRestart();
  };

  /** 등록하지 않고 직접 떠난다 — 선보관을 지운다. 제출이 일시 실패해 보관한 기록(다시 등록하기)은 남긴다 */
  const discardPresaved = () => {
    if (sessionId && !registered && !canRetry) storage.removePendingSubmission(sessionId);
  };

  // 등록 전 예상 순위 (상위 100개 기준) — 등록 후에는 서버가 준 순위를 쓴다
  // 패널(=게임 오버)당 정확히 기간별 1회: StrictMode·Fast Refresh가 effect를 다시 돌려도 ref 가드로 재요청하지 않는다
  // (요청을 취소하지 않으므로 첫 실행의 응답이 그대로 반영된다. 전역 스로틀(초당 5)에 걸리지 않게)
  const estimatesRequestedRef = useRef(false);
  useEffect(() => {
    if (estimatesRequestedRef.current) return;
    estimatesRequestedRef.current = true;
    const myScore = score;
    for (const { key } of periods) {
      getGameRankings(gameType, key, ESTIMATE_LIMIT, board)
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
  }, [gameType, board, score, periods]);

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
      const { data } = await submitGameScore(gameType, { sessionId, playerName, replay }, accessToken);
      setRegistered(data);
      storage.addMyScoreId(data.scoreId);
      // 서버가 저장한 이름(정리값)을 다음 기본값으로 — 공유 카드·랭킹 이름과 같게 (games-polish P5, 없으면 보낸 이름)
      storage.saveLastName(data.playerName ?? playerName);
      storage.removePendingSubmission(sessionId);
    } catch (err) {
      const { kind, message: text, reload } = classifySubmitError(err, canRetry);
      if (kind === "name") {
        setNameError(text);
      } else if (kind === "final") {
        setSubmitError(text);
        setIsFinalError(true);
        setNeedsReload(reload === true);
        storage.removePendingSubmission(sessionId);
      } else {
        // 네트워크·429·5xx — 결과를 보관하고 다시 시도할 수 있게. 보관하지 못했으면(저장소 차단·용량) 떠나면 사라진다고 알린다 (FE-46)
        const kept = storage.savePendingSubmission({ sessionId, playerName, replay, score, savedAt: Date.now(), ...(board ? { board } : {}) });
        setSubmitError(kept ? text : `${text} 이 기기에 보관하지 못해 이 화면을 떠나면 기록이 사라져요.`);
        setCanRetry(true);
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
      {/* 게임별 표기(디펜스 "웨이브 n · 진척 p%")는 글이 길어 한 단계 작게 */}
      <p className={`mt-3 font-bold text-white ${game.formatScore ? "text-2xl" : "text-4xl"}`} data-testid="score-submit-score">
        {(game.formatScore ?? formatScore)(registered?.score ?? score)}
      </p>
      {isNewBest && <p className="mt-1 text-sm font-semibold text-amber-300">개인 최고 기록!</p>}
      {stats}

      {/* 순위 — 등록 전에는 예상, 등록 후에는 서버 순위 */}
      <div className={`mt-4 grid gap-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm ${periods.length === 3 ? "grid-cols-3" : "grid-cols-1"}`}>
        {periods.map(({ key, label }) => (
          <div key={key}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-0.5 font-semibold text-slate-100">{rankLabel(registered, estimates[key], key)}</p>
          </div>
        ))}
      </div>

      {registered ? (
        <div className="mt-5 flex flex-col gap-2">
          <p className="text-sm font-semibold text-emerald-300">랭킹에 등록했어요.</p>
          {showReplay && (
            <ButtonLink href={game.replayPath(registered.scoreId)} variant="secondary" size="md" fullWidth>
              ▶ 내 플레이 다시보기
            </ButtonLink>
          )}
          <ButtonLink href={rankingsHref(game.rankingsPath, registered.scoreId, board)} variant="secondary" size="md" fullWidth>
            랭킹 보기
          </ButtonLink>
          {/* 등록한 이름 — 등록 뒤에는 입력이 사라지므로 마지막 입력값을 정리한 것 */}
          {registeredActions?.(
            registered,
            registered.playerName ?? normalizePlayerName(name),
            bragLabel({ ranks: registered.ranks, isNewBest, periods: periods.map(({ key }) => key) }),
          )}
        </div>
      ) : sessionId && !isFinalError ? (
        <form onSubmit={handleSubmit} className="mt-5 text-left" noValidate>
          <label htmlFor={nameInputId} className="mb-1.5 block text-sm font-semibold text-slate-300">
            랭킹에 올릴 이름
          </label>
          <input
            ref={nameInputRef}
            id={nameInputId}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
            maxLength={PLAYER_NAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? `${nameInputId}-error ${nameInputId}-help` : `${nameInputId}-help`}
            disabled={isSubmitting}
            className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 text-base text-white placeholder-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            placeholder="이름 (1~12자)"
          />
          {/* 오류는 따로 알림 — 설명(aria-describedby)만으로는 스크린리더가 읽지 않는다 (FE-30) */}
          {nameError && (
            <p id={`${nameInputId}-error`} role="alert" className="mt-1 text-xs text-red-400">
              {nameError}
            </p>
          )}
          <p id={`${nameInputId}-help`} className="mt-1 text-xs text-slate-500">
            {`${playerNameLength(normalizePlayerName(name))}/${PLAYER_NAME_MAX_LENGTH} · 한글·영문·숫자·공백·_·-`}
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
        <div role="status" className="mt-5 rounded-xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
          <p>{submitError ?? sessionError ?? "이번 판은 랭킹에 등록할 수 없어요."}</p>
          {needsReload && (
            <Button type="button" variant="secondary" size="md" fullWidth className="mt-3 min-h-11" onClick={() => window.location.reload()}>
              새로고침
            </Button>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          size="md"
          className="min-h-11 flex-1"
          disabled={restarting}
          aria-busy={restarting}
          onClick={() => (wouldLoseRecord ? setConfirmRestart(true) : restart())}
        >
          {restarting ? "준비 중…" : "다시 하기"}
        </Button>
        <Link
          href={game.homePath}
          onClick={discardPresaved}
          className="flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 text-sm font-semibold text-slate-200 hover:border-white/40"
        >
          나가기
        </Link>
      </div>
      <ConfirmModal
        isOpen={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        onConfirm={() => {
          setConfirmRestart(false);
          restart();
        }}
        title="등록하지 않고 다시 할까요?"
        message="이번 판 기록은 랭킹에 올라가지 않고 사라져요."
        confirmLabel="다시 하기"
        cancelLabel="등록하러 가기"
        variant="danger"
      />
    </div>
  );
}
