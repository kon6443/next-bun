"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/types/api";
import type { ReplayData } from "@/types/game";
import { extractErrorMessage } from "@/app/utils/errorUtils";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { ACTION, ENGINE_VERSION, FRAMES_PER_SECOND, type GameState, createGame, stepFrame } from "../../../engine";
import { TetrisCanvas } from "../../../components/TetrisCanvas";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { buildShareContent } from "@/app/games/_shared/lib/shareSpec";
import { ACTION_LABELS } from "../../../lib/controls";
import { formatFrames, formatScore } from "@/app/games/_shared/lib/format";
import { cloneGameState } from "../../../lib/gameSnapshot";
import { type EffectTracker, createEffectTracker, observeAfter, observeBefore } from "../../../lib/effects";
import { loadReplay } from "@/app/games/_shared/lib/replayLoader";
import { TETRIS_SHARE } from "../../../lib/share";
import { type ReplayTimeline, buildTimeline, collectActions } from "../../../lib/replayTimeline";

const SPEEDS = [0.5, 1, 2, 4] as const;
const FRAME_MS = 1000 / FRAMES_PER_SECOND;
/** 즉시 동작(회전·하드드롭·홀드) 키를 눌린 것으로 보여 줄 프레임 */
const FLASH_FRAMES = 8;
const SEEK_STEP_FRAMES = 5 * FRAMES_PER_SECOND;
/** 뒤로 탐색할 때 처음부터가 아니라 가장 가까운 스냅샷부터 다시 시뮬레이션한다 */
const SNAPSHOT_INTERVAL = 10 * FRAMES_PER_SECOND;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string; notFound: boolean }
  | { status: "unsupported"; data: ReplayData }
  | { status: "ready"; data: ReplayData };

type Playback = { playing: boolean; speed: number; frame: number };
type Snapshot = { state: GameState; cursor: number };

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
  const { kakaoReady, kakaoScript } = useKakaoReady();

  const stateRef = useRef<GameState | null>(null);
  const drawRef = useRef<(() => void) | null>(null);
  /** 플레이와 같은 연출 — 뒤로 탐색하면 프레임이 되돌아가 기록이 스스로 비워진다 */
  const effectsRef = useRef<EffectTracker | null>(null);
  if (effectsRef.current === null) effectsRef.current = createEffectTracker();
  const timelineRef = useRef<ReplayTimeline | null>(null);
  const cursorRef = useRef(0);
  const bufferRef = useRef<number[]>([]);
  const lastActionFrameRef = useRef<Record<number, number>>({});
  const snapshotsRef = useRef<Map<number, Snapshot>>(new Map());
  const playbackRef = useRef(playback);
  playbackRef.current = playback;

  useEffect(() => {
    let cancelled = false;
    loadReplay("tetris", scoreId)
      .then((data) => {
        if (cancelled) return;
        if (data.engineVersion !== ENGINE_VERSION) {
          setLoad({ status: "unsupported", data });
          return;
        }
        timelineRef.current = buildTimeline(data.inputs);
        stateRef.current = createGame({ seed: data.seed, das: data.das, arr: data.arr });
        cursorRef.current = 0;
        snapshotsRef.current = new Map();
        setLoad({ status: "ready", data });
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
  }, [scoreId]);

  const data = load.status === "ready" ? load.data : null;
  const totalFrames = data?.frames ?? 0;

  /** 화면 없이 한 프레임 진행 — 기록이 입력을 공급한다 */
  const advance = useCallback((): boolean => {
    const state = stateRef.current;
    const timeline = timelineRef.current;
    if (!state || !timeline || state.over || state.frame >= totalFrames) return false;
    const frame = state.frame;
    cursorRef.current = collectActions(timeline, cursorRef.current, frame, bufferRef.current);
    for (const code of bufferRef.current) lastActionFrameRef.current[code] = frame;
    const effects = effectsRef.current;
    if (effects) observeBefore(effects, state);
    const applied = stepFrame(state, bufferRef.current, bufferRef.current.length);
    if (effects) observeAfter(effects, state, bufferRef.current, applied);
    if (state.frame % SNAPSHOT_INTERVAL === 0 && !snapshotsRef.current.has(state.frame)) {
      snapshotsRef.current.set(state.frame, { state: cloneGameState(state), cursor: cursorRef.current });
    }
    return true;
  }, [totalFrames]);

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
      if (!data) return;
      const clamped = Math.max(0, Math.min(totalFrames, target));
      if (!stateRef.current || clamped < stateRef.current.frame) {
        // 뒤로: 목표 이전의 가장 가까운 스냅샷(없으면 처음)부터 다시 시뮬레이션
        let base: Snapshot | null = null;
        for (const [frame, snapshot] of snapshotsRef.current) {
          if (frame <= clamped && (!base || frame > base.state.frame)) base = snapshot;
        }
        stateRef.current = base ? cloneGameState(base.state) : createGame({ seed: data.seed, das: data.das, arr: data.arr });
        cursorRef.current = base ? base.cursor : 0;
        lastActionFrameRef.current = {};
      }
      while (stateRef.current.frame < clamped && advance()) {
        // 목표 프레임까지
      }
      refreshPressed();
      drawRef.current?.();
      setPlayback((p) => ({ ...p, frame: stateRef.current?.frame ?? 0 }));
    },
    [advance, data, refreshPressed, totalFrames],
  );

  // 재생 루프 — 진행한 뒤 같은 애니메이션 프레임 안에서 그린다
  useEffect(() => {
    if (!data) return;
    let rafId = 0;
    let last = 0;
    let acc = 0;
    const loop = (timestamp: number) => {
      const { playing, speed } = playbackRef.current;
      const state = stateRef.current;
      if (playing && state) {
        if (last === 0) last = timestamp;
        acc += Math.min(timestamp - last, 100) * speed;
        last = timestamp;
        let ended = false;
        while (acc >= FRAME_MS) {
          acc -= FRAME_MS;
          if (!advance()) {
            ended = true;
            break;
          }
        }
        refreshPressed();
        const frame = state.frame;
        setPlayback((p) => (p.frame === frame && !ended ? p : { ...p, frame, playing: ended ? false : p.playing }));
      } else {
        last = 0;
        acc = 0;
      }
      drawRef.current?.();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [advance, data, refreshPressed]);

  const togglePlay = useCallback(() => {
    const current = playbackRef.current;
    if (!current.playing && current.frame >= totalFrames) {
      // 끝에서 누르면 처음부터
      seek(0);
      setPlayback((p) => ({ ...p, playing: true }));
      return;
    }
    setPlayback((p) => ({ ...p, playing: !p.playing }));
  }, [seek, totalFrames]);

  // 키보드: Space 재생/정지, ←/→ 5초 이동
  useEffect(() => {
    if (!data) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (shareOpenRef.current) return;
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
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center" role={load.status === "loading" ? "status" : "alert"}>
          {load.status === "loading" ? (
            <p className="text-sm text-slate-400">리플레이를 불러오는 중...</p>
          ) : load.status === "unsupported" ? (
            <p className="text-sm text-slate-300">이전 버전 기록이라 재생할 수 없어요.</p>
          ) : (
            <p className="text-sm text-red-300">{load.notFound ? "기록을 찾을 수 없어요." : load.message}</p>
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

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]" style={{ touchAction: "auto" }}>
      <header className="flex items-center gap-3 px-3 py-2">
        <Link
          href="/games/tetris/rankings"
          className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
        >
          ← 랭킹
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">
            ▶ {loaded.playerName} · {formatScore(loaded.score)}점
          </p>
          <p className="text-xs text-slate-500">
            전체 {loaded.rank}위 · {formatFullDateTime(new Date(loaded.createdAt))}
          </p>
        </div>
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
          kakaoReady={kakaoReady}
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
        <TetrisCanvas stateRef={stateRef} drawRef={drawRef} effectsRef={effectsRef} />
        <KeyOverlay pressed={pressed} />
      </div>

      {/* 재생 컨트롤 */}
      <footer className="space-y-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-3 text-xs tabular-nums text-slate-400">
          <span>{formatFrames(playback.frame)}</span>
          <input
            type="range"
            min={0}
            max={totalFrames}
            value={playback.frame}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="재생 위치"
            className="h-11 min-w-0 flex-1 accent-sky-400"
          />
          <span>{formatFrames(totalFrames)}</span>
        </div>
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
