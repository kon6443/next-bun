"use client";

import Link from "next/link";
import { type ReactNode, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HighlightMarks, HighlightNav } from "@/app/games/_shared/components/HighlightRail";
import type { HighlightKindSpec } from "@/app/games/_shared/lib/highlights";
import { useDefenseCanvas } from "../hooks/useDefenseCanvas";
import { applyTickEvents, createTickNotice } from "../lib/fx";
import { TARGET_NAMES, TOWER_NAMES, ENEMY_NAMES } from "../lib/labels";
import { type DefenseHighlightKind, type PreparedReplay, type ReplayCommand, type ReplayCursor, advanceCursor, initialCursor, seekCursor } from "../lib/replayRunner";
import { toRenderMap, toRenderView } from "../lib/toRenderView";
import { DamageNumberPool, EffectPool, ParticlePool } from "../renderer/particles";
import { type RenderView, createRenderView } from "../renderer/renderView";
import { createSceneScratch, drawBossBar, drawSceneLayer } from "../renderer/sceneLayer";
import { toScreenX, toScreenY } from "../renderer/viewport";

/**
 * 리플레이 재생기 (defense DESIGN §F7·§F10 재생기) — 서버 기록·캠페인 로컬 다시보기 공용
 * 재생/일시정지 · 배속 0.5~4× · 진행 막대(웨이브 경계 눈금 + 명령 점) · 명령 목록(누르면 그 틱으로) · 명령 순간 슬롯 강조
 * 엔진·사전 패스는 replay(기록 버전 엔진) — 그리기는 플레이 화면과 같은 렌더러
 * 키보드: Space 재생/일시정지 · ←/→ 5초
 */
type Props = {
  replay: PreparedReplay;
  title: string;
  /** 제목 아래 한 줄(기록자·점수 등) */
  subtitle?: ReactNode;
  exitHref: string;
  exitLabel: string;
  /** 머리줄 오른쪽 동작(공유 등) */
  actions?: ReactNode;
};

const SPEEDS = [0.5, 1, 2, 4] as const;
const MAX_TICKS_PER_FRAME = 16;
const MAX_CATCH_UP_MS = 100;
const SEEK_STEP_SECONDS = 5;
/** 명령 순간 슬롯 강조 — 재생 시간 1.2초 */
const HIGHLIGHT_SECONDS = 1.2;
const DPR_CAP = 2;
/** 하이라이트로 가면 그 순간 이만큼 앞부터 — 무엇이 일어나는지 보이게 (games-polish P4) */
const HIGHLIGHT_LEAD_SECONDS = 1.5;
/** "이전 하이라이트"가 방금 간 것을 다시 고르지 않게 */
const HIGHLIGHT_SLACK_SECONDS = 2;
export const DEFENSE_HIGHLIGHT_KINDS: Record<DefenseHighlightKind, HighlightKindSpec> = {
  leak: { label: "목숨 잃음", dot: "bg-rose-400" },
  boss: { label: "보스 처치", dot: "bg-amber-300" },
};

function formatTicks(ticks: number, tps: number): string {
  const total = Math.floor(ticks / tps);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 명령 한 줄 — 명령 목록·접근성 이름 */
function commandLabel(replay: PreparedReplay, command: ReplayCommand): string {
  const { OP } = replay.engine;
  const slot = command.slot >= 0 ? ` · 슬롯 ${command.slot + 1}` : "";
  switch (command.op) {
    case OP.BUILD:
      return `${TOWER_NAMES[command.b] ?? "타워"} 건설${slot}`;
    case OP.UPGRADE:
      return `업그레이드${slot}`;
    case OP.BRANCH:
      return `분기 선택${slot}`;
    case OP.SELL:
      return `판매${slot}`;
    case OP.SET_TARGET:
      return `타게팅 ${TARGET_NAMES[command.b] ?? ""}${slot}`;
    case OP.CALL_WAVE:
      return "웨이브 호출";
    case OP.PICK_AUGMENT:
      return "증강 선택";
    default:
      return "명령";
  }
}

export function ReplayPlayer({ replay, title, subtitle, exitHref, exitLabel, actions }: Props) {
  const { engine, totalTicks } = replay;
  const tps = engine.TICKS_PER_SECOND;
  const tickMs = 1000 / tps;
  const renderMap = useMemo(() => toRenderMap(replay.stage), [replay.stage]);
  const canvas = useDefenseCanvas(renderMap, DPR_CAP);

  const cursorRef = useRef<ReplayCursor | null>(null);
  if (cursorRef.current === null) cursorRef.current = initialCursor(replay);
  const viewsRef = useRef<{ prev: RenderView; curr: RenderView } | null>(null);
  if (viewsRef.current === null) {
    const state = cursorRef.current.state;
    viewsRef.current = { prev: toRenderView(state, createRenderView()), curr: toRenderView(state, createRenderView()) };
  }
  const poolsRef = useRef<{ particles: ParticlePool; numbers: DamageNumberPool; effects: EffectPool; scratch: ReturnType<typeof createSceneScratch> } | null>(null);
  if (poolsRef.current === null) poolsRef.current = { particles: new ParticlePool(400), numbers: new DamageNumberPool(40), effects: new EffectPool(48), scratch: createSceneScratch() };
  const noticeRef = useRef(createTickNotice());

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  /** 화면 갱신 신호 — 보이는 초가 바뀔 때·탐색·명령 때 */
  const [tick, setTick] = useState(0);
  const [highlight, setHighlight] = useState<{ slot: number; tick: number } | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const speedRef = useRef<number>(speed);
  speedRef.current = speed;
  const accRef = useRef(0);

  const resetViews = useCallback(() => {
    const state = cursorRef.current!.state;
    const views = viewsRef.current!;
    toRenderView(state, views.prev);
    toRenderView(state, views.curr);
    const pools = poolsRef.current!;
    pools.particles.clear();
    pools.numbers.clear();
    pools.effects.clear();
  }, []);

  /** 막대 끌기는 프레임마다 한 번만 탐색한다(끌 때마다 스냅샷 복제·재시뮬레이션이 겹치지 않게) */
  const pendingSeekRef = useRef<number | null>(null);
  /** 끄는 동안 막대 손잡이 위치 — 탐색이 끝나면 지운다 */
  const [dragTick, setDragTick] = useState<number | null>(null);
  /** 탐색 — highlight: 그 틱 명령의 슬롯을 강조(명령 목록에서 고른 경우 — 이미 적용된 명령이라 재생 중 강조가 오지 않는다) */
  const seek = useCallback(
    (target: number, highlightSlot = -1) => {
      // 직접 탐색(명령 목록·←/→)이 같은 프레임의 끌기 대기를 이긴다
      pendingSeekRef.current = null;
      setDragTick(null);
      cursorRef.current = seekCursor(replay, target);
      accRef.current = 0;
      resetViews();
      setHighlight(highlightSlot >= 0 ? { slot: highlightSlot, tick: cursorRef.current.state.tick } : null);
      setTick(cursorRef.current.state.tick);
      // 끝으로 탐색했으면 멈춘다 — 재생 중 끝 판정은 루프의 진행 분기에만 있어 "Ⅱ"인 채 멈춰 보였다 (games-polish FE-38)
      if (cursorRef.current.state.over || cursorRef.current.state.tick >= replay.totalTicks) setPlaying(false);
    },
    [replay, resetViews],
  );
  const seekRef = useRef(seek);
  seekRef.current = seek;

  // 그리기·진행 루프
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const events: number[] = [];
    const loop = (now: number) => {
      const frameMs = last === 0 ? 0 : now - last;
      last = now;
      if (pendingSeekRef.current !== null) {
        const target = pendingSeekRef.current;
        seekRef.current(target);
      }
      const cursor = cursorRef.current!;
      const views = viewsRef.current!;
      const pools = poolsRef.current!;
      if (playingRef.current && cursor.state.tick < totalTicks && !cursor.state.over) {
        accRef.current += Math.min(frameMs, MAX_CATCH_UP_MS) * speedRef.current;
        let n = 0;
        let shownSecond = Math.floor(cursor.state.tick / tps);
        // 목숨·웨이브는 바뀐 순간 보인다 — 시간 표시처럼 1초 단위로 기다리지 않게 (games-polish FE-41)
        const shownLives = cursor.state.lives;
        const shownWaves = cursor.state.wavesStarted;
        while (accRef.current >= tickMs && n < MAX_TICKS_PER_FRAME && cursor.state.tick < totalTicks && !cursor.state.over) {
          advanceCursor(
            engine,
            cursor,
            replay.inputs,
            cursor.state.tick + 1,
            events,
            (ev) => {
              const swap = views.prev;
              views.prev = views.curr;
              views.curr = toRenderView(cursor.state, swap);
              if (ev) applyTickEvents(ev, views.curr, views.prev, pools, noticeRef.current, true);
            },
            (command) => {
              if (command.slot >= 0) setHighlight({ slot: command.slot, tick: command.tick });
            },
          );
          accRef.current -= tickMs;
          n++;
        }
        if (n === MAX_TICKS_PER_FRAME) accRef.current = 0;
        if (Math.floor(cursor.state.tick / tps) !== shownSecond || cursor.state.over || cursor.state.lives !== shownLives || cursor.state.wavesStarted !== shownWaves) {
          shownSecond = Math.floor(cursor.state.tick / tps);
          setTick(cursor.state.tick);
        }
        if (cursor.state.over || cursor.state.tick >= totalTicks) {
          setPlaying(false);
          setTick(cursor.state.tick);
        }
      }
      pools.particles.update(frameMs);
      pools.numbers.update(frameMs);
      pools.effects.update(frameMs);
      const ctx = canvas.fgContextRef.current;
      const viewport = canvas.viewportRef.current;
      if (ctx && viewport) {
        const alpha = playingRef.current ? Math.min(1, accRef.current / tickMs) : 1;
        drawSceneLayer(ctx, { prev: views.prev, curr: views.curr, alpha, particles: pools.particles, numbers: pools.numbers, effects: pools.effects, showDamageNumbers: true, timeMs: now }, viewport, pools.scratch);
        drawBossBar(ctx, viewport, views.curr, ENEMY_NAMES);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, replay.inputs, totalTicks, tps, tickMs, canvas.fgContextRef, canvas.viewportRef]);

  const togglePlay = useCallback(() => {
    const cursor = cursorRef.current!;
    // 끝에서 누르면 처음부터
    if (!playingRef.current && (cursor.state.over || cursor.state.tick >= totalTicks)) seek(0);
    setPlaying((p) => !p);
  }, [seek, totalTicks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      // 버튼·링크·막대에 포커스가 있으면 그 요소의 키(Space = 누르기, ←/→ = 막대 이동)
      if (e.target instanceof Element && e.target.closest("input,textarea,select,button,a,[role=dialog]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(cursorRef.current!.state.tick + (e.key === "ArrowLeft" ? -1 : 1) * SEEK_STEP_SECONDS * tps);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seek, tps]);

  const state = cursorRef.current.state;
  const viewport = canvas.viewport;
  // 보이는 시간(tick 상태)은 초 단위로만 갱신된다 — 강조 판정은 지금 커서 틱으로
  const nowTick = state.tick;
  const highlightOn = highlight && nowTick >= highlight.tick && nowTick - highlight.tick <= HIGHLIGHT_SECONDS * tps;
  const highlightSpot = highlightOn && viewport ? replay.stage.map.slots[highlight.slot] : null;
  // 막대는 1초 단위 — 끝(30의 배수가 아닐 수 있다)까지 닿게 위로 올린 칸 수, 탐색은 끝 틱으로 잘린다
  const rangeMax = Math.ceil(totalTicks / tps) * tps;
  // 눈금·명령 점은 기록마다 고정 — 초마다 다시 그리지 않는다(긴 판은 명령이 수천 개)
  const marks = useMemo(
    () => (
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-2">
        {replay.waveTicks.map((t, i) => (
          <span key={`w${i}`} data-testid="defense-replay-wave-mark" className="absolute top-0 h-2 w-px bg-slate-400/70" style={{ left: `${(t / rangeMax) * 100}%` }} />
        ))}
        {replay.commands.map((c, i) => (
          <span key={`c${i}`} className="absolute top-0.5 h-1 w-1 -translate-x-1/2 rounded-full bg-sky-300/60" style={{ left: `${(c.tick / rangeMax) * 100}%` }} />
        ))}
      </div>
    ),
    // 막대 손잡이와 같은 눈금(막대 끝 = rangeMax)
    [replay, rangeMax],
  );

  return (
    <main className="flex h-full flex-col" aria-label={`${title} 리플레이`} data-testid="defense-replay">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Link href={exitHref} aria-label={exitLabel} className="flex min-h-11 min-w-10 items-center justify-center rounded-full border border-white/15 text-slate-300">
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-white">{title}</h1>
          {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
        </div>
        <dl className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-slate-200" data-testid="defense-replay-hud">
          <div className="flex gap-0.5">
            <dt>
              <span aria-hidden="true">♥</span>
              <span className="sr-only">목숨</span>
            </dt>
            <dd>{state.lives}</dd>
          </div>
          <div className="flex gap-0.5">
            <dt>
              <span aria-hidden="true">W</span>
              <span className="sr-only">웨이브</span>
            </dt>
            <dd data-testid="defense-replay-wave">{state.wavesStarted}</dd>
          </div>
        </dl>
        {actions}
      </header>
      <div className="relative min-h-0 flex-1" ref={canvas.containerRef}>
        <canvas ref={canvas.bgRef} className="absolute inset-0" aria-hidden="true" />
        <canvas ref={canvas.fgRef} className="absolute inset-0" aria-hidden="true" />
        {highlightSpot && viewport && (
          <span
            aria-hidden="true"
            data-testid="defense-replay-highlight"
            data-slot={highlight!.slot}
            className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-amber-300/90 motion-safe:animate-ping"
            style={{ left: toScreenX(viewport, highlightSpot.x), top: toScreenY(viewport, highlightSpot.y) }}
          />
        )}
      </div>
      <footer className="grid gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="relative">
          {/* 웨이브 경계 눈금 · 명령 점 · 하이라이트 — 막대 위 장식(조작은 range·명령 목록·하이라이트 버튼) */}
          {marks}
          <HighlightMarks marks={replay.highlights} kinds={DEFENSE_HIGHLIGHT_KINDS} max={rangeMax} />
          <input
            type="range"
            min={0}
            max={rangeMax}
            step={tps}
            value={dragTick ?? tick}
            onChange={(e) => {
              const target = Math.min(totalTicks, Number(e.target.value));
              setDragTick(target);
              pendingSeekRef.current = target;
            }}
            aria-label="재생 위치"
            aria-valuetext={`${formatTicks(tick, tps)} / ${formatTicks(totalTicks, tps)}`}
            data-testid="defense-replay-seek"
            className="mt-2 h-11 w-full accent-sky-400"
          />
        </div>
        {/* 좁은 화면(320px)에서는 배속 묶음이 다음 줄로 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            data-testid="defense-replay-play"
            aria-pressed={playing}
            aria-label="재생 (Space)"
            className="min-h-11 min-w-11 rounded-full bg-sky-500/30 font-semibold text-white"
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
          <span className="text-xs tabular-nums text-slate-300" data-testid="defense-replay-time">
            {formatTicks(tick, tps)} / {formatTicks(totalTicks, tps)}
          </span>
          <div role="group" aria-label="재생 배속" className="ml-auto flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={speed === s}
                data-testid={`defense-replay-speed-${s}`}
                onClick={() => setSpeed(s)}
                className={`min-h-11 min-w-10 rounded-full px-1.5 text-xs font-semibold ${speed === s ? "bg-sky-500/30 text-white" : "border border-white/15 text-slate-300"}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
        <HighlightNav
          marks={replay.highlights}
          kinds={DEFENSE_HIGHLIGHT_KINDS}
          position={state.tick}
          leadIn={HIGHLIGHT_LEAD_SECONDS * tps}
          slack={HIGHLIGHT_SLACK_SECONDS * tps}
          formatAt={(at) => formatTicks(at, tps)}
          onSeek={(target) => seek(target)}
        />
        <button
          type="button"
          aria-expanded={listOpen}
          data-testid="defense-replay-commands-toggle"
          onClick={() => setListOpen((o) => !o)}
          className="min-h-11 rounded-full border border-white/15 text-xs text-slate-300"
        >
          명령 {replay.commands.length}개 {listOpen ? "닫기" : "보기"}
        </button>
        {listOpen && <CommandList replay={replay} tps={tps} onPick={seek} />}
      </footer>
    </main>
  );
}

/**
 * 명령 목록 — 기록마다 고정이라 memo (games-polish FE-39)
 * 재생 중 화면 상태가 매초 바뀌어도 수천 줄을 다시 만들지 않는다(입력 상한 20000). onPick(seek)은 기록이 같으면 같은 함수
 */
const CommandList = memo(function CommandList({ replay, tps, onPick }: { replay: PreparedReplay; tps: number; onPick: (tick: number, slot: number) => void }) {
  return (
    <ol className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/60 p-1 text-xs" data-testid="defense-replay-commands">
      {replay.commands.map((c, i) => (
        <li key={i}>
          <button type="button" data-testid={`defense-replay-command-${i}`} onClick={() => onPick(c.tick, c.slot)} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-slate-200 hover:bg-white/5">
            <span className="w-10 shrink-0 tabular-nums text-slate-400">{formatTicks(c.tick, tps)}</span>
            <span>{commandLabel(replay, c)}</span>
          </button>
        </li>
      ))}
    </ol>
  );
});
