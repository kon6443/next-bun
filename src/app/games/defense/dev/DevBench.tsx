"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "@/app/games/_shared/lib/share";
import { layoutStyles } from "@/styles/teams";
import { TICKS_PER_SECOND } from "../engine";
import { useDefenseCanvas } from "../hooks/useDefenseCanvas";
import { type BenchCounts, type BenchMode, type BenchScene, createEngineScene, createSyntheticScene } from "../lib/benchScene";
import { RollingStats } from "../lib/frameStats";
import { DamageNumberPool, ParticlePool } from "../renderer/particles";
import { type QualityMode, DRAW_BUDGET_MS, QualityController } from "../renderer/quality";
import { createSceneScratch, drawSceneLayer } from "../renderer/sceneLayer";

/**
 * 렌더러 실기기 측정 화면 (defense DESIGN §F10·R1) — 합성 장면 수량 슬라이더 + FPS·틱·그리기 시간 오버레이
 * 측정: 수량을 맞추고 "10초 측정" → 결과 JSON을 복사해 보고한다
 */
const TICK_MS = 1000 / TICKS_PER_SECOND;
const MAX_TICKS_PER_FRAME = 8;
const MAX_CATCH_UP_MS = 100;
const MEASURE_MS = 10_000;
/** 표본 용량 — 10초 × 240Hz까지 밀려나지 않게 */
const STATS_CAPACITY = 2400;
const PARTICLE_CAPACITY = 400;
const NUMBER_CAPACITY = 40;

type Overlay = {
  fps: number;
  frameAvg: number;
  drawAvg: number;
  drawP95: number;
  tickAvg: number;
  enemies: number;
  projectiles: number;
  particles: number;
  qualityLevel: number;
  dpr: number;
  backing: string;
};

const EMPTY_OVERLAY: Overlay = { fps: 0, frameAvg: 0, drawAvg: 0, drawP95: 0, tickAvg: 0, enemies: 0, projectiles: 0, particles: 0, qualityLevel: 0, dpr: 1, backing: "" };

/** 첫 렌더에만 만든다 — useRef(new …)는 렌더마다 인스턴스를 만들고 버려 측정 중 GC 잡음이 된다 */
function useLazyRef<T>(create: () => T): { readonly current: T } {
  const ref = useRef<T | null>(null);
  if (ref.current === null) ref.current = create();
  return ref as { readonly current: T };
}

/** performance.now() 해상도 추정 — 5ms 동안 연속 호출의 가장 작은 0 아닌 차이 (iOS Safari는 1ms 수준). 못 찾으면 null */
function timerResolutionMs(): number | null {
  let min = Infinity;
  const start = performance.now();
  let prev = start;
  for (let now = prev; now - start < 5 && min > 0.001; now = performance.now()) {
    if (now > prev) min = Math.min(min, now - prev);
    prev = now;
  }
  return Number.isFinite(min) ? Math.round(min * 1000) / 1000 : null;
}

type MeasureSettings = { mode: BenchMode; counts: BenchCounts; damageNumbers: boolean; qualityMode: QualityMode; levelAtStart: number };

function makeScene(mode: BenchMode, counts: BenchCounts): BenchScene {
  return mode === "engine" ? createEngineScene(counts) : createSyntheticScene(counts);
}

export default function DevBench() {
  const [mode, setMode] = useState<BenchMode>("synthetic");
  const [counts, setCounts] = useState<BenchCounts>({ enemies: 200, projectiles: 400, particles: 400 });
  const [damageNumbers, setDamageNumbers] = useState(true);
  const [qualityMode, setQualityMode] = useState<QualityMode>("high");
  const [dprCap, setDprCap] = useState(2);
  const [overlay, setOverlay] = useState<Overlay>(EMPTY_OVERLAY);
  const [measuring, setMeasuring] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [measureNote, setMeasureNote] = useState<string | null>(null);

  // 장면은 모드가 바뀔 때만 새로 — 수량은 아래 effect가 setCounts로 넘긴다
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const scene = useMemo(() => makeScene(mode, countsRef.current), [mode]);
  const canvas = useDefenseCanvas(scene.map, dprCap);
  const quality = useLazyRef(() => new QualityController("high"));
  const pools = useLazyRef(() => ({ particles: new ParticlePool(PARTICLE_CAPACITY), numbers: new DamageNumberPool(NUMBER_CAPACITY) }));
  const stats = useLazyRef(() => ({ frame: new RollingStats(STATS_CAPACITY), draw: new RollingStats(STATS_CAPACITY), tick: new RollingStats(STATS_CAPACITY) }));
  const optionsRef = useRef({ damageNumbers });
  optionsRef.current = { damageNumbers };
  /** 측정 중 상태 — 루프(effect 밖 값)가 읽는다 */
  const measureRef = useRef<{ active: boolean; frames: number; settings: MeasureSettings | null }>({ active: false, frames: 0, settings: null });

  useEffect(() => scene.setCounts(counts), [scene, counts]);
  useEffect(() => {
    quality.current.setMode(qualityMode);
  }, [quality, qualityMode]);

  // 자동 품질이 DPR 단계를 바꾸면 캔버스 백버퍼를 다시 맞춘다
  const syncDpr = useCallback(() => {
    const cap = quality.current.current.dprCap;
    setDprCap((prev) => (prev === cap ? prev : cap));
  }, [quality]);

  useEffect(() => {
    let rafId = 0;
    let last = 0;
    let acc = 0;
    let lastOverlay = 0;
    const scratch = createSceneScratch();
    const loop = (now: number) => {
      // 첫 프레임·백그라운드 복귀 직후는 간격을 모른다 — 표본에서 뺀다
      const known = last !== 0;
      const frameMs = known ? now - last : TICK_MS;
      last = now;
      acc += Math.min(frameMs, MAX_CATCH_UP_MS);
      const level = quality.current.current;
      let ticks = 0;
      while (acc >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
        const tickMs = scene.tick({ particles: pools.current.particles, numbers: pools.current.numbers, particleScale: level.particleScale });
        if (mode === "engine") stats.current.tick.push(tickMs);
        acc -= TICK_MS;
        ticks++;
      }
      if (ticks === MAX_TICKS_PER_FRAME) acc = 0;
      pools.current.particles.update(frameMs);
      pools.current.numbers.update(frameMs);

      const ctx = canvas.fgContextRef.current;
      const viewport = canvas.viewportRef.current;
      if (ctx && viewport) {
        const t0 = performance.now();
        drawSceneLayer(
          ctx,
          {
            prev: scene.prev,
            curr: scene.curr,
            alpha: acc / TICK_MS,
            particles: pools.current.particles,
            numbers: pools.current.numbers,
            showDamageNumbers: optionsRef.current.damageNumbers && level.damageNumbers,
            timeMs: now,
          },
          viewport,
          scratch,
        );
        const drawMs = performance.now() - t0;
        stats.current.draw.push(drawMs);
        if (known) {
          stats.current.frame.push(frameMs);
          if (measureRef.current.active) measureRef.current.frames += 1;
        }
        if (quality.current.record(drawMs, now)) syncDpr();
      }

      if (now - lastOverlay > 500) {
        lastOverlay = now;
        const frame = stats.current.frame.summary();
        const draw = stats.current.draw.summary();
        const tick = stats.current.tick.summary();
        const vp = canvas.viewportRef.current;
        setOverlay({
          fps: frame.avg ? 1000 / frame.avg : 0,
          frameAvg: frame.avg,
          drawAvg: draw.avg,
          drawP95: draw.p95,
          tickAvg: tick.avg,
          enemies: scene.curr.enemies.length,
          projectiles: scene.curr.projectiles.length,
          particles: pools.current.particles.count,
          qualityLevel: quality.current.level,
          dpr: vp?.dpr ?? 1,
          backing: vp ? `${Math.round(vp.width * vp.dpr)}×${Math.round(vp.height * vp.dpr)}` : "",
        });
      }
      rafId = requestAnimationFrame(loop);
    };
    // 탭이 가려지면 rAF가 멈춘다 — 복귀 첫 간격을 표본에서 빼고, 측정 중이면 그 측정은 무효
    const onVisibility = () => {
      if (!document.hidden) return;
      last = 0;
      if (measureRef.current.active) {
        measureRef.current.active = false;
        setMeasuring(false);
        setMeasureNote("측정 중 화면이 가려져 취소했어요. 화면을 켠 채로 다시 측정해 주세요.");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scene, mode, canvas.fgContextRef, canvas.viewportRef, syncDpr, quality, pools, stats]);

  const startMeasure = () => {
    for (const s of Object.values(stats.current)) s.reset();
    // 측정 중에는 설정 컨트롤을 막는다 — 결과에는 시작 시점 설정을 싣는다
    measureRef.current = { active: true, frames: 0, settings: { mode, counts, damageNumbers, qualityMode, levelAtStart: quality.current.level } };
    setResult(null);
    setMeasureNote(null);
    setMeasuring(true);
  };

  useEffect(() => {
    if (!measuring) return;
    const timer = setTimeout(() => {
      const measure = measureRef.current;
      if (!measure.active || !measure.settings) return;
      measure.active = false;
      const settings = measure.settings;
      const frame = stats.current.frame.summary();
      const draw = stats.current.draw.summary();
      const tick = stats.current.tick.summary();
      const vp = canvas.viewportRef.current;
      const round = (n: number) => Math.round(n * 100) / 100;
      setResult(
        JSON.stringify(
          {
            at: new Date().toISOString(),
            userAgent: navigator.userAgent,
            devicePixelRatio: window.devicePixelRatio,
            mode: settings.mode,
            counts: {
              requested: settings.counts,
              actual: { enemies: scene.curr.enemies.length, projectiles: scene.curr.projectiles.length, particles: pools.current.particles.count },
            },
            damageNumbers: settings.damageNumbers,
            // 자동 모드에서 측정 중 단계가 내려가면 앞뒤 표본이 섞인다 — 비교 측정은 높음·낮음 고정으로
            quality: { mode: settings.qualityMode, levelAtStart: settings.levelAtStart, levelAtEnd: quality.current.level },
            canvas: vp ? { css: `${Math.round(vp.width)}×${Math.round(vp.height)}`, dpr: vp.dpr } : null,
            frames: measure.frames,
            timerResolutionMs: timerResolutionMs(),
            note: "drawMs는 그리기 명령 기록(JS) 시간 — 채움·합성(GPU) 비용은 frameMs에 나타난다. 판정은 frameMs p95와 함께",
            fps: round(frame.avg ? 1000 / frame.avg : 0),
            frameMs: { avg: round(frame.avg), p95: round(frame.p95), max: round(frame.max) },
            drawMs: { avg: round(draw.avg), p95: round(draw.p95), max: round(draw.max), budget: DRAW_BUDGET_MS },
            engineTickMs: settings.mode === "engine" ? { avg: round(tick.avg), p95: round(tick.p95), max: round(tick.max), budget: 1.5 } : null,
          },
          null,
          2,
        ),
      );
      setMeasuring(false);
    }, MEASURE_MS);
    return () => clearTimeout(timer);
  }, [measuring, scene, canvas.viewportRef, pools, quality, stats]);

  const slider = (key: keyof BenchCounts, max: number, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-slate-300">
      <span>
        {label} <span className="tabular-nums text-slate-400">{counts[key]}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={10}
        value={counts[key]}
        disabled={measuring || (key === "projectiles" && mode === "engine")}
        onChange={(e) => setCounts((c) => ({ ...c, [key]: Number(e.target.value) }))}
        className="min-h-11 w-full"
      />
    </label>
  );

  return (
    // 하단 내비(BNB)가 떠 있는 화면 — 다른 페이지와 같은 하단 여백 토큰
    <main className={`mx-auto flex min-h-screen w-full max-w-md flex-col gap-3 bg-slate-950 px-4 pt-4 text-slate-100 ${layoutStyles.bottomPaddingDefault}`}>
      <h1 className="text-lg font-bold">디펜스 렌더러 측정</h1>
      <div ref={canvas.containerRef} className="relative w-full overflow-hidden rounded-xl border border-white/10" style={{ aspectRatio: "9 / 15" }}>
        <canvas ref={canvas.bgRef} className="absolute inset-0" aria-hidden="true" />
        <canvas ref={canvas.fgRef} className="absolute inset-0" aria-label="측정 장면" role="img" />
        <dl className="pointer-events-none absolute left-2 top-2 grid grid-cols-[auto_auto] gap-x-2 rounded-lg bg-slate-950/80 px-2 py-1 font-mono text-[11px] tabular-nums text-slate-200">
          <dt>FPS</dt>
          <dd>{overlay.fps.toFixed(0)}</dd>
          <dt>프레임</dt>
          <dd>{overlay.frameAvg.toFixed(1)}ms</dd>
          <dt>그리기</dt>
          <dd className={overlay.drawP95 > DRAW_BUDGET_MS ? "text-red-300" : ""}>
            {overlay.drawAvg.toFixed(2)} / p95 {overlay.drawP95.toFixed(2)}ms
          </dd>
          {mode === "engine" && (
            <>
              <dt>틱</dt>
              <dd className={overlay.tickAvg > 1.5 ? "text-red-300" : ""}>{overlay.tickAvg.toFixed(3)}ms</dd>
            </>
          )}
          <dt>적·탄·입자</dt>
          <dd>
            {overlay.enemies}·{overlay.projectiles}·{overlay.particles}
          </dd>
          <dt>품질·DPR</dt>
          <dd>
            {overlay.qualityLevel} · {overlay.dpr} ({overlay.backing})
          </dd>
        </dl>
      </div>

      <section className="grid gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3" aria-label="측정 설정">
        <div role="group" aria-label="장면" className="grid grid-cols-2 gap-1">
          {(["synthetic", "engine"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={measuring}
              onClick={() => setMode(m)}
              className={`min-h-11 rounded-lg text-sm font-semibold ${mode === m ? "bg-sky-500/30 text-white" : "border border-white/15 text-slate-400"}`}
            >
              {m === "synthetic" ? "합성(렌더러만)" : "엔진 구동"}
            </button>
          ))}
        </div>
        {slider("enemies", 200, "적")}
        {slider("projectiles", 400, mode === "engine" ? "투사체(엔진이 정함)" : "투사체")}
        {slider("particles", PARTICLE_CAPACITY, "파티클")}
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={damageNumbers} disabled={measuring} onChange={(e) => setDamageNumbers(e.target.checked)} className="h-5 w-5" />
          데미지 숫자
        </label>
        <div role="group" aria-label="품질" className="grid grid-cols-3 gap-1">
          {(["high", "auto", "low"] as const).map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={qualityMode === q}
              disabled={measuring}
              onClick={() => {
                setQualityMode(q);
                setDprCap(q === "low" ? 1 : 2);
              }}
              className={`min-h-11 rounded-lg text-sm ${qualityMode === q ? "bg-sky-500/30 text-white" : "border border-white/15 text-slate-400"}`}
            >
              {q === "high" ? "높음" : q === "auto" ? "자동" : "낮음"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={startMeasure}
          disabled={measuring}
          className="min-h-11 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 text-sm font-semibold text-white disabled:opacity-50"
        >
          {measuring ? "측정 중… (10초, 화면을 켜 두세요)" : "10초 측정"}
        </button>
        {measureNote && (
          <p role="status" className="text-xs text-amber-300">
            {measureNote}
          </p>
        )}
      </section>

      {result && (
        <section className="grid gap-2" aria-label="측정 결과">
          <pre className="max-h-64 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-200">{result}</pre>
          <button
            type="button"
            onClick={async () => {
              const outcome = await copyText(result);
              setCopyNote(outcome === "copied" ? "복사했어요." : "복사하지 못했어요. 위 결과를 길게 눌러 복사해 주세요.");
            }}
            className="min-h-11 rounded-full border border-white/20 text-sm font-semibold text-slate-200"
          >
            결과 JSON 복사
          </button>
          {copyNote && (
            <p role="status" className="text-center text-xs text-slate-400">
              {copyNote}
            </p>
          )}
        </section>
      )}
    </main>
  );
}
