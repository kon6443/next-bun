"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { loadReplay } from "@/app/games/_shared/lib/replayLoader";
import { formatViewCount } from "@/app/games/_shared/lib/format";
import { displayedViewCount, useRecordedViewCount, useReplayWatchReport } from "@/app/games/_shared/hooks/useReplayStats";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { ApiError } from "@/types/api";
import type { ParamsReplayData } from "@/types/game";
import { canReplayVersion, loadReplayEngine } from "../engine-versions";
import { CAMPAIGN, stagePath } from "../lib/campaign";
import { rankingsHref } from "@/app/games/_shared/components/ScoreSubmitPanel";
import { DEFENSE_GAME, formatDefenseScore } from "../lib/defenseGame";
import { DIFFICULTY_NAMES } from "../lib/labels";
import { type LocalReplay, loadLocalReplay } from "../lib/localReplay";
import { boardTitle, modeOfBoardKey } from "../lib/rankedBoards";
import { type PreparedReplay, type ReplayHeader, prepareReplay } from "../lib/replayRunner";
import { ReplayPlayer } from "./ReplayPlayer";

/**
 * 리플레이 화면 입구 (defense DESIGN §F7·§F10 라우트) — 서버 기록(replays/[scoreId])·캠페인 로컬(replays/local/[stageId])
 * 기록의 엔진 버전으로 엔진을 받아(engine-versions) 사전 패스(진행률) → 재생기
 */
type Prepared = { status: "loading"; progress: number } | { status: "ready"; replay: PreparedReplay } | { status: "error"; message: string };

const BROKEN = "기록을 재생하지 못했어요(손상된 기록).";

/** 헤더 + 엔진 버전 → 재생 준비 (헤더가 없으면 대기) */
function usePreparedReplay(header: ReplayHeader | null, engineVersion: number | null): Prepared {
  const [prepared, setPrepared] = useState<Prepared>({ status: "loading", progress: 0 });
  useEffect(() => {
    if (!header || engineVersion === null) return;
    let cancelled = false;
    // 다른 기록으로 바뀌면 이전 준비 결과를 바로 지운다(엔진을 받는 동안 옛 재생기가 남지 않게)
    setPrepared({ status: "loading", progress: 0 });
    (async () => {
      if (!canReplayVersion(engineVersion)) {
        setPrepared({ status: "error", message: "이 기록은 지금 버전의 게임으로 재생할 수 없어요." });
        return;
      }
      const engine = await loadReplayEngine(engineVersion);
      if (cancelled) return;
      if (!engine) {
        setPrepared({ status: "error", message: "재생 엔진을 불러오지 못했어요." });
        return;
      }
      const result = await prepareReplay(
        engine,
        header,
        (progress) => {
          if (!cancelled) setPrepared({ status: "loading", progress });
        },
        // 화면을 떠나면(또는 다른 기록) 긴 판의 사전 패스를 묶음 단위로 멈춘다
        () => cancelled,
      );
      if (cancelled) return;
      setPrepared(typeof result === "string" ? { status: "error", message: BROKEN } : { status: "ready", replay: result });
    })().catch(() => {
      if (!cancelled) setPrepared({ status: "error", message: BROKEN });
    });
    return () => {
      cancelled = true;
    };
  }, [header, engineVersion]);
  return prepared;
}

function Status({ children, exitHref, exitLabel, testId }: { children: ReactNode; exitHref: string; exitLabel: string; testId: string }) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" data-testid={testId}>
      {children}
      <Link href={exitHref} className="flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-slate-100">
        {exitLabel}
      </Link>
    </main>
  );
}

function Loading({ progress }: { progress: number }) {
  return (
    <div role="status" aria-live="polite" className="grid w-full max-w-xs gap-2" data-testid="defense-replay-loading">
      <p className="text-sm text-slate-300">리플레이 준비 중… {Math.round(progress * 100)}%</p>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full bg-sky-400" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
    </div>
  );
}

/** 서버 기록 — 주간 보드는 주가 끝나고 4시간(세션 TTL) 뒤까지 404(D-027·D-032) */
export function ServerReplay({ scoreId, actions }: { scoreId: number; actions?: (data: ParamsReplayData) => ReactNode }) {
  const [data, setData] = useState<ParamsReplayData | null>(null);
  /** retryable: 일시 실패(망·429·5xx) — "다시 시도"로 다시 받는다(실패는 캐시되지 않는다, games-polish FE-25) */
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const addWatched = useReplayWatchReport("defense", scoreId);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadReplay("defense", scoreId)
      .then((replay) => !cancelled && setData(replay))
      .catch((err) => {
        if (cancelled) return;
        const notFound = err instanceof ApiError && err.isNotFoundError();
        setError({
          message: notFound ? "기록을 찾을 수 없어요. 주간 도전 기록은 주가 끝나고 4시간 뒤에 공개돼요." : extractErrorMessage(err, "리플레이를 불러오지 못했어요."),
          retryable: !notFound,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [scoreId, attempt]);
  const mode = data?.boardKey ? modeOfBoardKey(data.boardKey) : null;
  // 헤더는 받은 기록이 바뀔 때만 새로 — 준비 effect가 렌더마다 다시 돌지 않게
  const header = useMemo<ReplayHeader | null>(() => (data && data.boardKey && mode ? { mode, boardKey: data.boardKey, seed: data.seed, ticks: data.frames, inputs: data.inputs } : null), [data, mode]);
  const prepared = usePreparedReplay(header, data && mode ? data.engineVersion : null);
  // 재생 준비가 끝난 뒤에만 조회로 센다 — 손상·재생할 수 없는 버전은 세지 않는다
  const recordedViewCount = useRecordedViewCount("defense", scoreId, prepared.status === "ready");
  const exitHref = data?.boardKey ? rankingsHref(DEFENSE_GAME.rankingsPath, scoreId, data.boardKey) : DEFENSE_GAME.rankingsPath;
  if (error || (data && !mode)) {
    return (
      <Status exitHref={exitHref} exitLabel="랭킹으로" testId="defense-replay-error">
        <p className="text-sm text-slate-200">{error?.message ?? "재생할 수 없는 기록이에요."}</p>
        {error?.retryable && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="flex min-h-11 items-center rounded-full bg-sky-500/30 px-5 text-sm font-semibold text-white"
          >
            다시 시도
          </button>
        )}
      </Status>
    );
  }
  if (!data || prepared.status === "loading") {
    return (
      <Status exitHref={exitHref} exitLabel="랭킹으로" testId="defense-replay-pending">
        <Loading progress={prepared.status === "loading" ? prepared.progress : 0} />
      </Status>
    );
  }
  if (prepared.status === "error") {
    return (
      <Status exitHref={exitHref} exitLabel="랭킹으로" testId="defense-replay-error">
        <p className="text-sm text-slate-200">{prepared.message}</p>
      </Status>
    );
  }
  return (
    <ReplayPlayer
      key={scoreId}
      replay={prepared.replay}
      title={boardTitle(data.boardKey!)}
      subtitle={`${data.playerName} · ${formatDefenseScore(data.score)} · ${data.rank}위`}
      subtitleStat={formatViewCount(displayedViewCount(recordedViewCount, data.viewCount))}
      exitHref={exitHref}
      exitLabel="랭킹으로"
      actions={actions?.(data)}
      onWatched={addWatched}
    />
  );
}

/** 캠페인 로컬 다시보기 — 이 기기의 스테이지별 최고 판(공유 대상 아님) */
export function LocalReplayView({ stageId }: { stageId: string }) {
  const [slot, setSlot] = useState<LocalReplay | null | undefined>(undefined);
  useEffect(() => setSlot(loadLocalReplay(stageId)), [stageId]);
  const header = useMemo<ReplayHeader | null>(() => (slot ? { mode: "campaign", boardKey: slot.boardKey, seed: slot.seed, ticks: slot.ticks, inputs: slot.inputs } : null), [slot]);
  const prepared = usePreparedReplay(header, slot ? slot.engineVersion : null);
  const meta = CAMPAIGN.find((s) => s.id === stageId) ?? null;
  const exitHref = meta ? stagePath(meta.id) : "/games/defense";
  if (slot === undefined) return null;
  if (slot === null) {
    return (
      <Status exitHref={exitHref} exitLabel="스테이지 화면으로" testId="defense-replay-error">
        <p className="text-sm text-slate-200">이 기기에 저장된 다시보기가 없어요. 스테이지를 깨면 가장 좋은 판이 저장돼요.</p>
      </Status>
    );
  }
  if (prepared.status === "loading") {
    return (
      <Status exitHref={exitHref} exitLabel="스테이지 화면으로" testId="defense-replay-pending">
        <Loading progress={prepared.progress} />
      </Status>
    );
  }
  if (prepared.status === "error") {
    return (
      <Status exitHref={exitHref} exitLabel="스테이지 화면으로" testId="defense-replay-error">
        <p className="text-sm text-slate-200">{prepared.message}</p>
      </Status>
    );
  }
  return (
    <ReplayPlayer
      key={stageId}
      replay={prepared.replay}
      title={`스테이지 ${meta?.number ?? ""} ${DIFFICULTY_NAMES[slot.difficulty]} 다시보기`}
      subtitle={`별 ${slot.stars}개 · 남은 목숨 ${slot.livesLeft}`}
      exitHref={exitHref}
      exitLabel="스테이지 화면으로"
    />
  );
}
