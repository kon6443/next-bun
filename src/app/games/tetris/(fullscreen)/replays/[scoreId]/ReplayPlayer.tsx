"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/types/api";
import type { ReplayData } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { ACTION, ENGINE_VERSION, FRAMES_PER_SECOND, type GameState, createGame, stepFrame } from "../../../engine";
import { TetrisCanvas } from "../../../components/TetrisCanvas";
import { toBoardSkins } from "../../../lib/skins";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { buildShareContent } from "@/app/games/_shared/lib/shareSpec";
import { ACTION_LABELS } from "../../../lib/controls";
import { formatFrames, formatScore, formatViewCount } from "@/app/games/_shared/lib/format";
import { displayedViewCount, useRecordedViewCount, useReplayWatchReport } from "@/app/games/_shared/hooks/useReplayStats";
import { cloneGameState } from "../../../lib/gameSnapshot";
import { type EffectTracker, createEffectTracker, drainCues, observeAfter, observeBefore } from "../../../lib/effects";
import { getSoundPlayer, replayCues } from "../../../lib/sound/soundPlayer";
import { SoundButton } from "@/app/games/_shared/components/SoundButton";
import { loadReplay } from "@/app/games/_shared/lib/replayLoader";
import { TETRIS_SHARE } from "../../../lib/share";
import { challengePath, challengeRootId } from "../../../lib/challenge";
import { isDailyBoardKey } from "../../../lib/daily";
import { tetrisRankLabel } from "../../../lib/replayCard";
import { rankingsHref } from "@/app/games/_shared/components/ScoreSubmitPanel";
import { TETRIS_GAME } from "../../../lib/game";
import { getGameScore } from "@/services/gameService";
import type { ScoreSummary } from "@/types/game";
import { ChallengeShareButton } from "../../../components/ChallengeShareButton";
import { collectActions } from "../../../lib/replayTimeline";
import { advanceClock, createClock, resetClock } from "@/app/games/_shared/lib/fixedStep";
import { type PreparedTetrisReplay, type TetrisHighlightKind, SNAPSHOT_INTERVAL, nearestSnapshot, prepareTetrisReplay } from "../../../lib/replayPrepare";
import { HighlightMarks, HighlightNav } from "@/app/games/_shared/components/HighlightRail";
import type { HighlightKindSpec } from "@/app/games/_shared/lib/highlights";

/** 재생 중 React 상태를 갱신하는 간격(프레임) — 탐색·끝은 바로 */
const PLAYBACK_UI_STEP = 6;
const SPEEDS = [0.5, 1, 2, 4] as const;
/** 재생은 탭이 잠들면 따라잡지 않는다 — 한 번에 이만큼만(배속 전) */
const MAX_CATCH_UP_MS = 100;
const FRAME_MS = 1000 / FRAMES_PER_SECOND;
/** 즉시 동작(회전·하드드롭·홀드) 키를 눌린 것으로 보여 줄 프레임 */
const FLASH_FRAMES = 8;
const SEEK_STEP_FRAMES = 5 * FRAMES_PER_SECOND;
/** 하이라이트로 가면 그 순간 이만큼 앞부터 · "이전"이 방금 간 것을 다시 고르지 않게 (games-polish P4) */
const HIGHLIGHT_LEAD_FRAMES = 1.5 * FRAMES_PER_SECOND;
const HIGHLIGHT_SLACK_FRAMES = 2 * FRAMES_PER_SECOND;
export const TETRIS_HIGHLIGHT_KINDS: Record<TetrisHighlightKind, HighlightKindSpec> = {
  pc: { label: "퍼펙트 클리어", dot: "bg-amber-300" },
  tspin: { label: "T-스핀", dot: "bg-fuchsia-400" },
  tetris: { label: "테트리스", dot: "bg-sky-400" },
  combo: { label: "콤보", dot: "bg-emerald-400" },
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string; notFound: boolean }
  | { status: "unsupported"; data: ReplayData }
  /** 재생 전 사전 패스(전 구간 스냅샷·하이라이트) — 긴 판은 몇 초 */
  | { status: "preparing"; progress: number }
  | { status: "ready"; data: ReplayData; prepared: PreparedTetrisReplay };

type Playback = { playing: boolean; speed: number; frame: number };

const HELD_KEYS = [ACTION.LEFT_PRESS, ACTION.RIGHT_PRESS, ACTION.SOFT_DROP_PRESS] as const;
const FLASH_KEYS = [ACTION.ROTATE_CW, ACTION.ROTATE_CCW, ACTION.HARD_DROP, ACTION.HOLD] as const;

export default function ReplayPlayer({ scoreId }: { scoreId: number }) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [playback, setPlayback] = useState<Playback>({ playing: false, speed: 1, frame: 0 });
  const [pressed, setPressed] = useState<Record<number, boolean>>({});
  const [shareOpen, setShareOpen] = useState(false);
  /** 공유 메뉴가 열려 있으면 재생기 키(Space·←→)를 쉰다 */
  const shareOpenRef = useRef(false);
  shareOpenRef.current = shareOpen;
  const { kakao, kakaoScript } = useKakaoReady();
  // 재생 준비가 끝난 뒤에만 조회로 센다 — 없는 기록·지원하지 않는 버전은 세지 않는다
  const recordedViewCount = useRecordedViewCount("tetris", scoreId, load.status === "ready");
  const addWatched = useReplayWatchReport("tetris", scoreId);
  // 도전장 보드 기록이면 도전장은 원본(root) 기준 — 서버가 root로 묶으므로 문구·링크도 원본으로 (B2)
  const loadedData = load.status === "ready" ? load.data : null;
  const challengeRoot = loadedData ? challengeRootId(loadedData.boardKey) : null;
  const [challengeOriginal, setChallengeOriginal] = useState<ScoreSummary | null>(null);
  useEffect(() => {
    if (challengeRoot === null) return;
    let cancelled = false;
    getGameScore("tetris", challengeRoot)
      .then(({ data }) => !cancelled && setChallengeOriginal(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [challengeRoot]);

  const stateRef = useRef<GameState | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  /** 플레이와 같은 연출 — 뒤로 탐색하면 프레임이 되돌아가 기록이 스스로 비워진다 */
  const effectsRef = useRef<EffectTracker | null>(null);
  if (effectsRef.current === null) effectsRef.current = createEffectTracker();
  const cursorRef = useRef(0);
  const bufferRef = useRef<number[]>([]);
  const lastActionFrameRef = useRef<Record<number, number>>({});
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  /** 오류 화면의 "다시 시도" — 일시 실패(망·429)면 다시 받는다 (games-polish FE-25) */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    loadReplay("tetris", scoreId)
      .then(async (data) => {
        if (cancelled) return;
        if (data.engineVersion !== ENGINE_VERSION) {
          setLoad({ status: "unsupported", data });
          return;
        }
        // 재생 전에 한 번 끝까지 — 전 구간 스냅샷(탐색은 최대 10초만 다시 돈다, FE-13)·하이라이트. 1분 분량마다 쉰다
        setLoad({ status: "preparing", progress: 0 });
        const prepared = await prepareTetrisReplay(data, {
          onProgress: (progress) => !cancelled && setLoad({ status: "preparing", progress }),
          isCancelled: () => cancelled,
        });
        if (cancelled || prepared === "cancelled") return;
        stateRef.current = createGame({ seed: data.seed, das: data.das, arr: data.arr });
        cursorRef.current = 0;
        setLoad({ status: "ready", data, prepared });
        setPlayback({ playing: true, speed: 1, frame: 0 });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoad({
          status: "error",
          message: extractErrorMessage(err, "리플레이를 불러오지 못했습니다."),
          notFound: err instanceof ApiError && err.isNotFoundError(),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [scoreId, attempt]);

  const data = load.status === "ready" ? load.data : null;
  const prepared = load.status === "ready" ? load.prepared : null;
  const totalFrames = data?.frames ?? 0;

  /** 화면 없이 한 프레임 진행 — 기록이 입력을 공급한다 */
  const advance = useCallback((): boolean => {
    const state = stateRef.current;
    const timeline = prepared?.timeline;
    if (!state || !timeline || state.over || state.frame >= totalFrames) return false;
    const frame = state.frame;
    cursorRef.current = collectActions(timeline, cursorRef.current, frame, bufferRef.current);
    for (const code of bufferRef.current) lastActionFrameRef.current[code] = frame;
    const effects = effectsRef.current;
    if (effects) observeBefore(effects, state);
    const applied = stepFrame(state, bufferRef.current, bufferRef.current.length);
    if (effects) observeAfter(effects, state, bufferRef.current, applied);
    return true;
  }, [prepared, totalFrames]);

  /** 키 오버레이 — 누르고 있는 키 + 방금 누른 즉시 동작 */
  const refreshPressed = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    const flags: Record<number, boolean> = {
      [ACTION.LEFT_PRESS]: state.leftHeld,
      [ACTION.RIGHT_PRESS]: state.rightHeld,
      [ACTION.SOFT_DROP_PRESS]: state.softDropHeld,
    };
    for (const code of FLASH_KEYS) {
      const at = lastActionFrameRef.current[code];
      flags[code] = at !== undefined && state.frame - at < FLASH_FRAMES;
    }
    setPressed((prev) =>
      [...HELD_KEYS, ...FLASH_KEYS].every((code) => prev[code] === flags[code]) ? prev : flags,
    );
  }, []);

  const seek = useCallback(
    (target: number) => {
      if (!prepared) return;
      const clamped = Math.max(0, Math.min(totalFrames, target));
      // 뒤로, 또는 스냅샷 한 칸보다 멀리 앞으로: 목표 이하 가장 가까운 스냅샷에서 — 전 구간에 있어 최대 10초만 다시 돈다 (FE-13)
      if (!stateRef.current || clamped < stateRef.current.frame || clamped - stateRef.current.frame > SNAPSHOT_INTERVAL) {
        const base = nearestSnapshot(prepared, clamped);
        stateRef.current = cloneGameState(base.state);
        cursorRef.current = base.cursor;
        lastActionFrameRef.current = {};
      }
      while (stateRef.current.frame < clamped && advance()) {
        // 목표 프레임까지
      }
      // 건너뛴 구간의 소리는 버린다 — 다음 재생 프레임에 한꺼번에 나지 않게
      if (effectsRef.current) drainCues(effectsRef.current);
      refreshPressed();
      // 그리기는 재생 루프가 다음 화면 프레임에 한다(멈춘 동안에도 매 rAF) — 여기서 그리면 저사양 판정 표본(화면 프레임 간격)이 쪼개진다
      setPlayback((p) => ({ ...p, frame: stateRef.current?.frame ?? 0 }));
    },
    [advance, prepared, refreshPressed, totalFrames],
  );

  // 재생 루프 — 진행한 뒤 같은 애니메이션 프레임 안에서 그린다
  useEffect(() => {
    if (!data) return;
    let rafId = 0;
    const clock = createClock();
    const loop = (timestamp: number) => {
      const { playing, speed } = playbackRef.current;
      const state = stateRef.current;
      if (playing && state) {
        addWatched(advanceClock(clock, timestamp, MAX_CATCH_UP_MS, speed));
        let ended = false;
        while (clock.acc >= FRAME_MS) {
          clock.acc -= FRAME_MS;
          if (!advance()) {
            ended = true;
            break;
          }
        }
        // 효과음 — 같은 관찰에서 나온 신호(플레이와 같은 소리). 빠른 배속은 큰 사건만
        if (effectsRef.current) getSoundPlayer().playCues(replayCues(drainCues(effectsRef.current), speed));
        refreshPressed();
        const frame = state.frame;
        // React 상태(시간·슬라이더·HUD)는 약 10Hz로만 — 캔버스는 매 화면 프레임 그린다 (FE-06)
        setPlayback((p) =>
          !ended && Math.abs(frame - p.frame) < PLAYBACK_UI_STEP ? p : { ...p, frame, playing: ended ? false : p.playing },
        );
      } else {
        resetClock(clock);
      }
      drawRef.current?.();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [advance, addWatched, data, refreshPressed]);

  // 소리 플레이어를 화면에 들어올 때 만들어 둔다 — 첫 조작(오디오 시작 조건)을 놓치지 않게. 배경음악은 재생 중에만, 나가면 끈다
  useEffect(() => {
    const player = getSoundPlayer();
    return () => player.setMusicPlaying(false);
  }, []);
  const ready = load.status === "ready";
  useEffect(() => {
    getSoundPlayer().setMusicPlaying(ready && playback.playing);
  }, [ready, playback.playing]);

  /** 끌기 전에 재생 중이었으면 놓을 때 이어서 (FE-17) */
  const resumeAfterDragRef = useRef(false);
  const endDrag = useCallback(() => {
    if (!resumeAfterDragRef.current) return;
    resumeAfterDragRef.current = false;
    setPlayback((p) => (p.frame >= totalFrames ? p : { ...p, playing: true }));
  }, [totalFrames]);

  const togglePlay = useCallback(() => {
    const current = playbackRef.current;
    if (!current.playing && current.frame >= totalFrames) {
      // 끝에서 누르면 처음부터
      seek(0);
      setPlayback((p) => ({ ...p, playing: true }));
      return;
    }
    // 멈출 때는 화면 시간·슬라이더를 판의 실제 프레임에 맞춘다(재생 중에는 몇 프레임마다만 갱신한다)
    setPlayback((p) => (p.playing ? { ...p, playing: false, frame: stateRef.current?.frame ?? current.frame } : { ...p, playing: true }));
  }, [seek, totalFrames]);

  // 키보드: Space 재생/정지, ←/→ 5초 이동
  useEffect(() => {
    if (!data) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (shareOpenRef.current) return;
      // 대화상자(소리 설정 등) 안의 키는 그 대화상자 몫 — 음량 막대의 ←/→가 뒤의 재생을 옮기지 않게 (P8)
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return;
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.code === "Space") {
        // 포커스된 버튼(속도·처음부터 등)은 Space로 그 버튼이 눌리게 둔다
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        seek((stateRef.current?.frame ?? 0) + (e.code === "ArrowLeft" ? -SEEK_STEP_FRAMES : SEEK_STEP_FRAMES));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data, seek, togglePlay]);

  if (load.status !== "ready") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center"
          role={load.status === "loading" || load.status === "preparing" ? "status" : "alert"}
        >
          {load.status === "loading" ? (
            <p className="text-sm text-slate-400">리플레이를 불러오는 중...</p>
          ) : load.status === "preparing" ? (
            <p className="text-sm text-slate-400" data-testid="tetris-replay-preparing">
              재생을 준비하는 중… {Math.round(load.progress * 100)}%
            </p>
          ) : load.status === "unsupported" ? (
            <p className="text-sm text-slate-300">이전 버전 기록이라 재생할 수 없어요.</p>
          ) : (
            <>
              <p className="text-sm text-red-300">{load.notFound ? "기록을 찾을 수 없어요." : load.message}</p>
              {/* 일시 실패(망·429)는 다시 받으면 된다 — 실패는 캐시하지 않는다(replayLoader) (FE-25) */}
              {!load.notFound && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-sky-500/30 px-6 text-sm font-semibold text-white"
                >
                  다시 시도
                </button>
              )}
            </>
          )}
          <Link href="/games/tetris/rankings" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-semibold text-slate-200">
            랭킹으로
          </Link>
        </div>
      </div>
    );
  }

  const state = stateRef.current;
  const loaded = load.data;
  const highlights = load.prepared.highlights;
  // 데일리·도전장 기록은 그 보드의 순위 — 랭킹으로 돌아갈 때도 그 보드로, 순위도 "전체"가 아니라 그 보드로 읽히게
  const boardKey = loaded.boardKey && (isDailyBoardKey(loaded.boardKey) || challengeRootId(loaded.boardKey) !== null) ? loaded.boardKey : null;
  const exitHref = boardKey ? rankingsHref(TETRIS_GAME.rankingsPath, loaded.scoreId, boardKey) : TETRIS_GAME.rankingsPath;
  const rankLabel = tetrisRankLabel(boardKey ?? undefined, loaded.rank);

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]" style={{ touchAction: "auto" }}>
      <header className="flex items-center gap-3 px-3 py-2">
        <Link
          href={exitHref}
          className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
        >
          ← 랭킹
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">
            ▶ {loaded.playerName} · {formatScore(loaded.score)}점
          </p>
          {/* 좁은 화면에서도 한 줄 — 순위·날짜만 말줄임, 조회수는 남긴다 */}
          <p className="flex justify-center gap-1 text-xs text-slate-500">
            <span className="truncate">
              {rankLabel} · {formatFullDateTime(new Date(loaded.createdAt))}
            </span>
            <span className="shrink-0">· {formatViewCount(displayedViewCount(recordedViewCount, loaded.viewCount))}</span>
          </p>
        </div>
        <SoundButton className="shrink-0" />
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="리플레이 공유"
          aria-haspopup="dialog"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-900/70 text-slate-300 hover:text-white"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        </button>
      </header>

      {/* 카카오 SDK — 키가 있을 때만, 공유 버튼이 있는 이 화면에서만 늦게 로드 */}
      {kakaoScript}
      {shareOpen && (
        <ShareMenu
          content={buildShareContent(TETRIS_SHARE, loaded)}
          kakao={kakao}
          onClose={() => setShareOpen(false)}
        />
      )}

      <dl className="flex justify-center gap-6 px-3 text-center text-xs tabular-nums">
        <div>
          <dt className="text-slate-500">점수</dt>
          <dd className="text-sm font-bold text-white">{formatScore(state?.score ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">줄</dt>
          <dd className="text-sm font-bold text-white">{state?.lines ?? 0}</dd>
        </div>
        <div>
          <dt className="text-slate-500">레벨</dt>
          <dd className="text-sm font-bold text-white">{state?.level ?? 1}</dd>
        </div>
      </dl>

      {/* 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다 */}
      <div className="relative min-h-0 flex-1">
        {/* 기록 주인의 보드 스킨(D-003) — 이전 서버·익명이면 기본 */}
        <TetrisCanvas stateRef={stateRef} drawRef={drawRef} effectsRef={effectsRef} skins={toBoardSkins(loadedData?.skins)} />
        <KeyOverlay pressed={pressed} />
      </div>

      {/* 재생 컨트롤 */}
      <footer className="space-y-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-3 text-xs tabular-nums text-slate-400">
          <span>{formatFrames(playback.frame)}</span>
          <div className="relative min-w-0 flex-1">
            <HighlightMarks marks={highlights} kinds={TETRIS_HIGHLIGHT_KINDS} max={totalFrames} />
            <input
              type="range"
              min={0}
              max={totalFrames}
              value={playback.frame}
              // 끄는 동안은 재생을 멈춘다 — 재생이 손잡이를 되돌려 끌기와 다투지 않게, 놓으면 이어서 (games-polish FE-17)
              onPointerDown={() => {
                if (!playbackRef.current.playing) return;
                resumeAfterDragRef.current = true;
                setPlayback((p) => ({ ...p, playing: false, frame: stateRef.current?.frame ?? p.frame }));
              }}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="재생 위치"
              aria-valuetext={`${formatFrames(playback.frame)} / ${formatFrames(totalFrames)}`}
              data-testid="tetris-replay-seek"
              className="h-11 w-full accent-sky-400"
            />
          </div>
          <span>{formatFrames(totalFrames)}</span>
        </div>
        <HighlightNav
          marks={highlights}
          kinds={TETRIS_HIGHLIGHT_KINDS}
          position={playback.frame}
          leadIn={HIGHLIGHT_LEAD_FRAMES}
          slack={HIGHLIGHT_SLACK_FRAMES}
          formatAt={formatFrames}
          onSeek={seek}
        />
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => seek(0)}
            aria-label="처음부터"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-slate-200"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playback.playing ? "일시정지" : "재생"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-lg text-white"
          >
            {playback.playing ? "❚❚" : "▶"}
          </button>
          <div role="group" aria-label="재생 속도" className="ml-2 flex gap-1">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={playback.speed === speed}
                onClick={(e) => {
                  // 마우스로 고른 뒤 포커스가 남으면 Space가 재생/정지 대신 이 버튼을 다시 누른다
                  if (e.detail > 0) e.currentTarget.blur();
                  setPlayback((p) => ({ ...p, speed }));
                }}
                className={`h-11 min-w-11 rounded-full px-2 text-xs font-semibold ${
                  playback.speed === speed ? "bg-sky-500/30 text-white" : "border border-white/15 text-slate-400"
                }`}
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
        {/* 도전장 — 같은 블록 순서로 이 기록에 도전 (games-growth B2). 링크는 원본 id만 있으면 되고, 공유 문구(원본 이름·점수)만 원본 요약을 기다린다 */}
        <div className="flex items-center justify-center gap-2">
          {(challengeRoot === null || challengeOriginal) && <ChallengeShareButton original={challengeOriginal ?? loaded} label="도전장 보내기" />}
          <Link
            href={challengePath(challengeRoot ?? loaded.scoreId)}
            className="flex min-h-11 items-center rounded-full border border-white/20 px-4 text-sm font-semibold text-slate-100"
          >
            직접 도전
          </Link>
        </div>
      </footer>
    </div>
  );
}

const OVERLAY_KEYS: { code: number; label: string }[] = [
  { code: ACTION.LEFT_PRESS, label: "←" },
  { code: ACTION.SOFT_DROP_PRESS, label: "↓" },
  { code: ACTION.RIGHT_PRESS, label: "→" },
  { code: ACTION.ROTATE_CCW, label: ACTION_LABELS[ACTION.ROTATE_CCW] },
  { code: ACTION.ROTATE_CW, label: ACTION_LABELS[ACTION.ROTATE_CW] },
  { code: ACTION.HARD_DROP, label: ACTION_LABELS[ACTION.HARD_DROP] },
  { code: ACTION.HOLD, label: ACTION_LABELS[ACTION.HOLD] },
];

/** 어떤 입력으로 플레이했는지 — 누르고 있는 키·방금 누른 키를 밝게 */
function KeyOverlay({ pressed }: { pressed: Record<number, boolean> }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden="true">
      {OVERLAY_KEYS.map(({ code, label }) => (
        <span
          key={code}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm font-bold transition-colors ${
            pressed[code] ? "border-sky-300 bg-sky-500/50 text-white" : "border-white/10 bg-slate-900/70 text-slate-500"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}
