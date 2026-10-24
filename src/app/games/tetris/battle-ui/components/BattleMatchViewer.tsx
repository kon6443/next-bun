"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BattleKoReason, BattleMatch } from "@/services/tetrisBattleService";
import { formatFullDateTime } from "@/app/utils/taskUtils";
import { ShareMenu } from "@/app/games/_shared/components/ShareMenu";
import { useKakaoReady } from "@/app/games/_shared/hooks/useKakaoReady";
import { formatFrames } from "@/app/games/_shared/lib/format";
import { HighlightMarks, HighlightNav } from "@/app/games/_shared/components/HighlightRail";
import type { HighlightKindSpec } from "@/app/games/_shared/lib/highlights";
import { FRAMES_PER_SECOND } from "../../engine";
import { TetrisCanvas } from "../../components/TetrisCanvas";
import { type ReplayTrack, useBattleMatchReplay } from "../hooks/useBattleMatchReplay";
import { useBoardFocus } from "../hooks/useBoardFocus";
import { type BattleHighlightKind, isRunnerDone, lastReceivedGarbage } from "../lib/battleReplayRunner";
import { buildBattleShareContent } from "../lib/battleShare";
import { advanceClock, createClock, resetClock } from "@/app/games/_shared/lib/fixedStep";

const SPEEDS = [0.5, 1, 2, 4] as const;
/** 재생은 탭이 잠들면 따라잡지 않는다 — 한 번에 이만큼만(배속 전) */
const MAX_CATCH_UP_MS = 100;
const FRAME_MS = 1000 / FRAMES_PER_SECOND;
const SEEK_STEP_FRAMES = 5 * FRAMES_PER_SECOND;
/** 가비지 도착 "+N" 표시를 남겨 둘 프레임 */
const GARBAGE_FLASH_FRAMES = 45;
/**
 * 재생 중 화면(시간·슬라이더·판 표시)을 다시 그리는 간격(프레임) — 캔버스는 매 화면 프레임 그리고, React 상태는 약 10Hz로만 (FE-06)
 * 탐색·끝에 닿음은 바로 반영한다
 */
const PLAYBACK_UI_STEP = 6;
/** 하이라이트로 가면 그 순간 이만큼 앞부터 · "이전"이 방금 간 것을 다시 고르지 않게 (games-polish P4) */
const HIGHLIGHT_LEAD_FRAMES = 1.5 * FRAMES_PER_SECOND;
const HIGHLIGHT_SLACK_FRAMES = 2 * FRAMES_PER_SECOND;
export const BATTLE_HIGHLIGHT_KINDS: Record<BattleHighlightKind, HighlightKindSpec> = {
  attack: { label: "큰 공격", dot: "bg-rose-400" },
  ko: { label: "KO", dot: "bg-amber-300" },
};

type Playback = { playing: boolean; speed: number; frame: number };

const KO_LABELS: Record<BattleKoReason, string> = {
  topout: "KO",
  disconnect: "연결 끊김",
  leave: "나감",
};

/**
 * 저장된 대전 경기 화면 (DESIGN §18) — 위: 결과표 / 가운데: 2~4판 동시 재생 / 아래: 재생 컨트롤
 * 재생 방식(배속·탐색·처음부터·키보드)은 싱글 리플레이 재생기와 같다
 */
export function BattleMatchViewer({ matchId }: { matchId: string }) {
  const { load, tracks, totalFrames, settled, frameRef, seekAll, retry, retryTrack, highlights } = useBattleMatchReplay(matchId);
  const [playback, setPlayback] = useState<Playback>({ playing: true, speed: 1, frame: 0 });
  const [shareOpen, setShareOpen] = useState(false);
  const shareOpenRef = useRef(false);
  shareOpenRef.current = shareOpen;
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const { kakao, kakaoScript } = useKakaoReady();
  // 판 하나 크게 보기 — 2판 이상일 때 (재생·컨트롤은 그대로 돈다)
  const focus = useBoardFocus(tracks.length > 1);

  const ready = load.status === "ready";
  // 재생 루프는 리플레이를 다 받은 뒤에 — 일부만 온 상태로 흘러가지 않게
  const playable = ready && settled;

  const seek = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(totalFrames, Math.round(target)));
      seekAll(clamped);
      setPlayback((p) => ({ ...p, frame: clamped }));
    },
    [seekAll, totalFrames],
  );

  // 재생 루프 — 공통 프레임을 올리고 모든 판을 그 프레임까지 진행한 뒤 같은 애니메이션 프레임 안에서 그린다
  useEffect(() => {
    if (!playable || totalFrames === 0) return;
    let rafId = 0;
    const clock = createClock();
    const loop = (timestamp: number) => {
      const { playing, speed } = playbackRef.current;
      if (playing) {
        advanceClock(clock, timestamp, MAX_CATCH_UP_MS, speed);
        let frame = frameRef.current;
        while (clock.acc >= FRAME_MS && frame < totalFrames) {
          clock.acc -= FRAME_MS;
          frame++;
        }
        if (frame !== frameRef.current) seekAll(frame);
        const ended = frame >= totalFrames;
        setPlayback((p) =>
          !ended && Math.abs(frame - p.frame) < PLAYBACK_UI_STEP ? p : { ...p, frame, playing: ended ? false : p.playing },
        );
      } else {
        resetClock(clock);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [frameRef, playable, seekAll, totalFrames]);

  const togglePlay = useCallback(() => {
    const current = playbackRef.current;
    if (!current.playing && current.frame >= totalFrames) {
      // 끝에서 누르면 처음부터
      seek(0);
      setPlayback((p) => ({ ...p, playing: true }));
      return;
    }
    // 멈출 때는 화면 시간·슬라이더를 판의 실제 프레임에 맞춘다(재생 중에는 몇 프레임마다만 갱신한다)
    setPlayback((p) => (p.playing ? { ...p, playing: false, frame: frameRef.current } : { ...p, playing: true }));
  }, [seek, totalFrames, frameRef]);

  // 키보드: Space 재생/정지, ←/→ 5초 이동
  useEffect(() => {
    if (!playable) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (shareOpenRef.current) return;
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.code === "Space") {
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        seek(frameRef.current + (e.code === "ArrowLeft" ? -SEEK_STEP_FRAMES : SEEK_STEP_FRAMES));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [frameRef, playable, seek, togglePlay]);

  if (load.status !== "ready") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center"
          role={load.status === "loading" ? "status" : "alert"}
        >
          {load.status === "loading" ? (
            <p className="text-sm text-slate-400">경기 기록을 불러오는 중...</p>
          ) : load.status === "notFound" ? (
            <>
              <p className="text-base font-semibold text-white">공개되지 않은 경기예요</p>
              <p className="mt-2 text-sm text-slate-400">없는 경기이거나 아직 저장 중이에요. 잠시 뒤 다시 열어 보세요.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-red-300">{load.message}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-sky-500/20 px-6 text-sm font-semibold text-sky-100"
              >
                다시 시도
              </button>
            </>
          )}
          <Link
            href="/games/tetris/battle"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 px-6 text-sm font-semibold text-slate-200"
          >
            대전 로비로
          </Link>
        </div>
      </div>
    );
  }

  const { match } = load;

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]" style={{ touchAction: "auto" }}>
      <header className="flex items-center gap-3 px-3 py-2">
        <Link
          href="/games/tetris"
          className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
        >
          ← 테트리스
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">{match.roomName}</p>
          <p className="text-xs text-slate-500">
            {match.playerCount}인전 · {formatFullDateTime(new Date(match.startedAt))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-label="경기 공유"
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
      {shareOpen && <ShareMenu content={buildBattleShareContent(match)} kakao={kakao} onClose={() => setShareOpen(false)} />}

      <ResultTable match={match} />
      {match.disputed && (
        <p className="mx-auto mt-1 w-[calc(100%-1.5rem)] max-w-xl text-xs text-amber-200/80" role="note">
          검증되지 않은 기록이 있어 그 플레이어는 다시보기에서 빠졌어요.
        </p>
      )}

      {focus.focusedId && (
        <div className="flex px-2 pt-2">
          <button
            ref={focus.backRef}
            type="button"
            onClick={focus.close}
            className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-300 hover:text-white"
          >
            ← 모든 판 보기
          </button>
        </div>
      )}
      {/* 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다 */}
      {/* 크게 볼 때 다른 판은 숨기기만 한다 — 캔버스를 다시 만들지 않고 재생은 계속 따라간다 */}
      <div
        className={`grid min-h-0 flex-1 gap-2 px-2 pt-2 ${
          focus.focusedId ? "grid-cols-1" : `grid-cols-2 ${tracks.length > 2 ? "grid-rows-2" : ""}`
        }`}
      >
        {tracks.map((track) => (
          <ReplayBoard
            key={track.player.playerId}
            track={track}
            frame={playback.frame}
            matchEnded={playback.frame >= totalFrames}
            hidden={focus.focusedId !== null && focus.focusedId !== track.player.playerId}
            boardProps={focus.boardProps(track.player.playerId, track.player.name)}
            onRetry={() => void retryTrack(track.player.playerId)}
          />
        ))}
      </div>

      {/* 재생 컨트롤 */}
      <footer className="space-y-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2">
        <div className="flex items-center gap-3 text-xs tabular-nums text-slate-400">
          <span>{formatFrames(playback.frame)}</span>
          <div className="relative min-w-0 flex-1">
            <HighlightMarks marks={highlights} kinds={BATTLE_HIGHLIGHT_KINDS} max={totalFrames} />
            <input
              type="range"
              min={0}
              max={totalFrames}
              value={playback.frame}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="재생 위치"
              // 프레임 수가 아니라 시간으로 읽게 (games-polish FE-26)
              aria-valuetext={`${formatFrames(playback.frame)} / ${formatFrames(totalFrames)}`}
              data-testid="battle-replay-seek"
              className="h-11 w-full accent-sky-400"
            />
          </div>
          <span>{formatFrames(totalFrames)}</span>
        </div>
        <HighlightNav
          marks={highlights}
          kinds={BATTLE_HIGHLIGHT_KINDS}
          position={playback.frame}
          leadIn={HIGHLIGHT_LEAD_FRAMES}
          slack={HIGHLIGHT_SLACK_FRAMES}
          formatAt={formatFrames}
          onSeek={seek}
          disabled={!playable}
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
            // 리플레이를 다 받기 전에는 누를 수 없다 — 받는 대로 자동 재생된다
            disabled={!playable}
            aria-label={!playable ? "기록 불러오는 중" : playback.playing ? "일시정지" : "재생"}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-lg text-white disabled:opacity-50"
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

/** 결과표 — 순위·이름·KO·보낸/받은 줄·최대 콤보. 재생 중 다시 그릴 일이 없어 memo */
const ResultTable = memo(function ResultTable({ match }: { match: BattleMatch }) {
  return (
    <table className="mx-auto w-[calc(100%-1.5rem)] max-w-xl text-xs tabular-nums">
      <caption className="sr-only">경기 결과</caption>
      <thead>
        <tr className="text-slate-500">
          <th scope="col" className="w-8 py-0.5 text-left font-normal">순위</th>
          <th scope="col" className="py-0.5 text-left font-normal">이름</th>
          <th scope="col" className="w-10 py-0.5 text-right font-normal">KO</th>
          <th scope="col" className="w-12 py-0.5 text-right font-normal">보낸 줄</th>
          <th scope="col" className="w-12 py-0.5 text-right font-normal">받은 줄</th>
          <th scope="col" className="w-12 py-0.5 text-right font-normal">콤보</th>
        </tr>
      </thead>
      <tbody>
        {match.players.map((p) => (
          <tr key={p.playerId} className={p.verdict === "INVALID" ? "text-slate-500" : p.place === 1 ? "text-amber-300" : "text-slate-200"}>
            <td className="py-0.5 font-semibold">{p.place}</td>
            <td className="max-w-0 truncate py-0.5">
              {p.name}
              {p.verdict === "INVALID" && <span className="ml-1 text-[10px] text-amber-300/80">검증 실패</span>}
            </td>
            <td className="py-0.5 text-right">{p.kos}</td>
            <td className="py-0.5 text-right">{p.sent}</td>
            <td className="py-0.5 text-right">{p.received}</td>
            <td className="py-0.5 text-right">{p.maxCombo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
});

const TRACK_MESSAGES: Partial<Record<ReplayTrack["status"], string>> = {
  loading: "기록을 불러오는 중...",
  missing: "기록 없음",
  invalid: "검증되지 않은 기록이라 재생하지 않아요",
  unsupported: "이전 버전 기록이라 재생할 수 없어요",
  error: "기록을 불러오지 못했어요",
};

/** 판 하나 — 이름·순위 띠 + 캔버스(왼쪽 가비지 게이지) + 가비지 도착·KO·우승 표시 */
function ReplayBoard({
  track,
  frame,
  matchEnded,
  hidden,
  boardProps,
  onRetry,
}: {
  track: ReplayTrack;
  frame: number;
  matchEnded: boolean;
  /** 다른 판을 크게 보는 중 */
  hidden: boolean;
  /** 크게 보기 버튼 역할 (useBoardFocus) */
  boardProps: ReturnType<ReturnType<typeof useBoardFocus>["boardProps"]>;
  /** 이 판 기록만 다시 받기 — 일시 실패(error)일 때 */
  onRetry: () => void;
}) {
  const { player, runner } = track;
  const message = TRACK_MESSAGES[track.status];
  // 기록이 있으면 그 판이 끝난 때(엔진 탈락 또는 리플레이 끝) — 서버 요약 frames는 마지막 고정 프레임이라 리플레이보다 짧을 수 있다
  // 기록이 없으면 서버 요약 frames에, 그 값이 0이면(고정 없이 끊김) 경기 끝에
  const koFrame = player.frames > 0 ? player.frames : Number.POSITIVE_INFINITY;
  const out = player.koReason !== null && (runner !== null ? isRunnerDone(runner) : frame >= koFrame || matchEnded);
  const won = matchEnded && player.place === 1;
  const garbage = runner && !isRunnerDone(runner) ? lastReceivedGarbage(runner.bs) : null;
  const showGarbage = garbage !== null && runner !== null && runner.bs.game.frame - garbage.frame < GARBAGE_FLASH_FRAMES;

  return (
    <section className={`min-h-0 min-w-0 flex-col ${hidden ? "hidden" : "flex"}`} aria-label={`${player.place}위 ${player.name}`}>
      <p className="flex items-center gap-1 truncate px-1 text-xs">
        <span className={`font-bold ${player.place === 1 ? "text-amber-300" : "text-slate-400"}`}>{player.place}위</span>
        <span className="truncate font-semibold text-slate-100">{player.name}</span>
        {/* 판(크게 보기 버튼) 안에 두면 버튼이 겹친다 — 이름 줄에 (FE-23) */}
        {track.status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            aria-label={`${player.name} 기록 다시 받기`}
            className="ml-auto flex min-h-11 shrink-0 items-center px-2 text-xs font-semibold text-sky-300 hover:text-sky-200"
          >
            다시 받기
          </button>
        )}
      </p>
      <div
        {...boardProps}
        className={`relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/5 bg-slate-950/40 ${
          boardProps.role ? "cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400" : ""
        }`}
      >
        {runner && <TetrisCanvas stateRef={track.stateRef} drawRef={track.drawRef} garbageRef={track.garbageRef} />}
        {message && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center text-sm text-slate-500">
            {message}
            {/* 기록이 없는 판은 탈락 이유를 문구 아래 작게 — 판 전체를 덮으면 "기록 없음"이 가려진다 */}
            {out && player.koReason && (
              <span className="rounded-md bg-red-500/80 px-2 py-0.5 text-xs font-bold text-white">{KO_LABELS[player.koReason]}</span>
            )}
          </div>
        )}
        {showGarbage && (
          <span className="pointer-events-none absolute left-1 top-1 rounded-md bg-red-500/80 px-1.5 py-0.5 text-xs font-bold text-white" aria-hidden="true">
            +{garbage.lines}
          </span>
        )}
        {out && player.koReason && runner && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/55">
            <span className="rounded-lg bg-red-500/85 px-3 py-1 text-base font-black text-white">{KO_LABELS[player.koReason]}</span>
          </div>
        )}
        {won && (
          <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
            <span className="rounded-lg bg-amber-400/90 px-3 py-1 text-base font-black text-slate-950">우승</span>
          </div>
        )}
      </div>
    </section>
  );
}
