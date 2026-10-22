"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ENGINE_VERSION, EVENT, EVENT_STRIDE, OP, findStage, type Stage } from "../engine";
import { useDefenseCanvas } from "../hooks/useDefenseCanvas";
import { type FrameInfo, type PlayResult, useDefensePlay } from "../hooks/useDefensePlay";
import { CAMPAIGN, type Difficulty, type StageMeta, parseBoardKey, randomSeed, stagePath } from "../lib/campaign";
import { settleCampaign } from "../lib/campaignResult";
import { DIFFICULTY_NAMES, TOWER_NAMES } from "../lib/labels";
import { isDifficultyUnlocked, loadProgress } from "../lib/progress";
import { type RingOption, currentRange, ringOptions, tapRing } from "../lib/ringOptions";
import { toRenderMap } from "../lib/toRenderView";
import { nextWaveIndex, wavePreview } from "../lib/wavePreview";
import { DamageNumberPool, ParticlePool } from "../renderer/particles";
import type { RenderView } from "../renderer/renderView";
import { createSceneScratch, drawLeakPulse, drawSceneLayer, drawSelection, findEnemyIndex } from "../renderer/sceneLayer";
import { toScreenX, toScreenY } from "../renderer/viewport";
import { Hud } from "./Hud";
import { ResultPanel } from "./ResultPanel";
import { TowerRing } from "./TowerRing";
import { WaveBar } from "./WaveBar";

/**
 * 캠페인 플레이 화면 (defense DESIGN §F1~§F4·§F7, F1a) — 캔버스(엔진 렌더) 위에 DOM 슬롯 버튼·링 메뉴·HUD
 * 슬롯은 DOM 버튼이라 키보드(Tab·Enter)·스크린리더·자동화(data-testid)로도 조작된다(§F10 입력: 캔버스 접근성)
 */

const PARTICLE_CAPACITY = 400;
const NUMBER_CAPACITY = 40;
/** 슬롯 버튼 크기 — 44px, 화면이 작아 이웃 슬롯과 겹치면 그 간격까지 줄인다(겹친 곳은 DOM 뒤 슬롯이 가져간다) */
const SLOT_BUTTON = 44;
/** 한 틱에 새로 만드는 파티클 상한 — 범위 명중이 몰려도 풀(400)을 한 틱에 덮어쓰지 않게 */
const PARTICLES_PER_TICK = 30;
const LEAK_PULSE_MS = 450;
const DPR_CAP = 2;

type Props = { boardKey: string; seed: number; fixedSeed: boolean };

export default function DefensePlay({ boardKey, seed, fixedSeed }: Props) {
  const parsed = useMemo(() => parseBoardKey(boardKey), [boardKey]);
  const stage = useMemo(() => findStage(boardKey), [boardKey]);
  const [attempt, setAttempt] = useState({ n: 0, seed });
  const [access, setAccess] = useState<"checking" | "ok" | "locked">("checking");

  useEffect(() => {
    if (!parsed) return;
    setAccess(isDifficultyUnlocked(loadProgress(), parsed.stage.id, parsed.difficulty) ? "ok" : "locked");
  }, [parsed]);

  if (!parsed || !stage) return null;
  const exitHref = stagePath(parsed.stage.id);
  if (access === "checking") return null;
  if (access === "locked") {
    return (
      <main className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-slate-200">아직 열리지 않은 스테이지·난이도예요.</p>
        <Link href={exitHref} className="flex min-h-11 items-center rounded-full border border-white/20 px-5 text-sm font-semibold">
          스테이지 화면으로
        </Link>
      </main>
    );
  }
  return (
    <PlaySession
      key={attempt.n}
      stage={stage}
      meta={parsed.stage}
      difficulty={parsed.difficulty}
      boardKey={boardKey}
      seed={attempt.seed}
      exitHref={exitHref}
      onRetry={() => setAttempt((a) => ({ n: a.n + 1, seed: fixedSeed ? seed : randomSeed() }))}
    />
  );
}

type SessionProps = {
  stage: Stage;
  meta: StageMeta;
  difficulty: Difficulty;
  boardKey: string;
  seed: number;
  exitHref: string;
  onRetry: () => void;
};

type Finished = { result: PlayResult; stars: number; replaySaved: boolean; progressSaved: boolean };

/**
 * 단축키 — 영문 글자면 e.key(AZERTY·Dvorak에서도 자판에 보이는 글자), 아니면(한글 'ㅔ'·IME 'Process') 물리 키 e.code
 * 숫자는 물리 키(숫자 줄·키패드 — AZERTY는 Shift 없이 '&'가 온다)
 */
function shortcutOf(e: KeyboardEvent): string | null {
  if (e.code === "Space") return " ";
  if (e.key === "Escape") return "Escape";
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^(Digit|Numpad)[1-6]$/.test(e.code)) return e.code.slice(-1);
  return null;
}

/** 글을 입력하는 요소면 Space는 그 요소의 것 — 버튼은 Enter로 누르고 Space는 늘 웨이브 호출(§F3) */
function isTextInput(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input,textarea,select,[contenteditable]") !== null;
}

function PlaySession({ stage, meta, difficulty, boardKey, seed, exitHref, onRetry }: SessionProps) {
  const renderMap = useMemo(() => toRenderMap(stage), [stage]);
  const canvas = useDefenseCanvas(renderMap, DPR_CAP);
  const fx = useRef<{ particles: ParticlePool; numbers: DamageNumberPool; scratch: ReturnType<typeof createSceneScratch> } | null>(null);
  if (fx.current === null) fx.current = { particles: new ParticlePool(PARTICLE_CAPACITY), numbers: new DamageNumberPool(NUMBER_CAPACITY), scratch: createSceneScratch() };
  const leakAtRef = useRef(-Infinity);
  /** 그리기 루프가 읽는 선택 표시 (맵 좌표·사거리) */
  const selectionRef = useRef<{ x: number; y: number; range: number } | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);

  const onTickEvents = useCallback((events: readonly number[], view: RenderView, prev: RenderView) => {
    const { particles, numbers } = fx.current!;
    let budget = PARTICLES_PER_TICK;
    for (let i = 0; i < events.length; i += EVENT_STRIDE) {
      const type = events[i];
      if (type === EVENT.HIT) {
        // 적 목록은 id 오름차순 — 이분 탐색. 마지막 일격은 이번 틱에 빠졌으니 직전 틱 위치로
        const id = events[i + 1];
        let index = findEnemyIndex(view.enemies, id);
        const list = index >= 0 ? view.enemies : prev.enemies;
        if (index < 0) index = findEnemyIndex(prev.enemies, id);
        if (index < 0) continue;
        const enemy = list[index];
        for (let k = 0; k < 3 && budget > 0; k++, budget--) particles.spawn(enemy.x, enemy.y, (Math.random() - 0.5) * 2400, (Math.random() - 0.5) * 2400, 350, 0);
        numbers.spawnNumber(enemy.x, enemy.y, events[i + 2], 700);
      } else if (type === EVENT.DEATH) {
        for (let k = 0; k < 6 && budget > 0; k++, budget--) particles.spawn(events[i + 2], events[i + 3], (Math.random() - 0.5) * 3200, (Math.random() - 0.5) * 3200, 500, 0);
      } else if (type === EVENT.LEAK) {
        leakAtRef.current = performance.now();
      }
    }
  }, []);

  /** 마지막으로 그린 프레임 — 루프가 멈춘 뒤(판 끝) 화면 크기가 바뀌면 다시 그린다 */
  const lastFrameRef = useRef<FrameInfo | null>(null);
  const onFrame = useCallback(
    (frame: FrameInfo) => {
      const ctx = canvas.fgContextRef.current;
      const viewport = canvas.viewportRef.current;
      const { particles, numbers, scratch } = fx.current!;
      lastFrameRef.current = frame;
      particles.update(frame.frameMs);
      numbers.update(frame.frameMs);
      if (!ctx || !viewport) return;
      drawSceneLayer(ctx, { prev: frame.prev, curr: frame.curr, alpha: frame.alpha, particles, numbers, showDamageNumbers: true, timeMs: frame.now }, viewport, scratch);
      if (selectionRef.current) drawSelection(ctx, selectionRef.current, viewport);
      drawLeakPulse(ctx, viewport, 1 - (frame.now - leakAtRef.current) / LEAK_PULSE_MS);
    },
    [canvas.fgContextRef, canvas.viewportRef],
  );

  // 크기가 바뀌면 캔버스 백버퍼가 지워진다 — 루프가 돌고 있으면 다음 프레임이 그리지만, 멈춘 뒤에는 여기서 한 번(경과 0)
  useEffect(() => {
    const frame = lastFrameRef.current;
    if (canvas.viewport && frame) onFrame({ ...frame, frameMs: 0 });
  }, [canvas.viewport, onFrame]);

  const onOver = useCallback(
    (result: PlayResult) => {
      const outcome = settleCampaign({ stageId: meta.id, difficulty, boardKey, seed, engineVersion: ENGINE_VERSION, ...result });
      setSelected(null);
      setArmed(null);
      setFinished({ result, ...outcome });
    },
    [meta.id, difficulty, boardKey, seed],
  );

  const { hud, dispatch, togglePause, cycleSpeed, stateRef } = useDefensePlay({ stage, seed, onTickEvents, onFrame, onOver });

  // 엔진 상태는 ref — HUD 스냅샷(골드·웨이브·명령 version이 바뀔 때만 새 객체)을 다시 계산 신호로 쓴다
  const options = useMemo(
    () => (selected === null || hud.status === "over" ? [] : ringOptions(stateRef.current, stage, selected)),
    [selected, hud, stage, stateRef],
  );

  // 선택·미리보기 → 캔버스 사거리 원
  useEffect(() => {
    if (selected === null) {
      selectionRef.current = null;
      return;
    }
    const spot = stage.map.slots[selected];
    const armedOption = options.find((o) => o.id === armed);
    selectionRef.current = { x: spot.x, y: spot.y, range: armedOption && armedOption.range > 0 ? armedOption.range : currentRange(stateRef.current, selected) };
  }, [selected, armed, options, stage, stateRef]);

  const slotButtons = useRef<(HTMLButtonElement | null)[]>([]);
  /** 링을 키보드(Enter·Space로 슬롯 누름)로 열었나 — 포커스 이동은 키보드로 연 경우만(마우스·터치면 포커스를 옮기지 않는다) */
  const [keyboardRing, setKeyboardRing] = useState(false);
  const keyboardRingRef = useRef(false);
  keyboardRingRef.current = keyboardRing;
  const close = useCallback(() => {
    setSelected((slot) => {
      // 키보드로 연 링이 닫히면 포커스를 그 슬롯으로 되돌린다(링 버튼이 사라져 포커스를 잃지 않게)
      if (slot !== null && keyboardRingRef.current) queueMicrotask(() => slotButtons.current[slot]?.focus({ preventScroll: true }));
      return null;
    });
    setArmed(null);
  }, []);

  /** 마지막 포인터 종류 — 마우스로 누른 슬롯만 포커스를 놓는다(터치·펜·보조기기 두 번 탭은 포커스를 그대로 둔다) */
  const lastPointerRef = useRef("");
  const selectSlot = (slot: number, byKeyboard: boolean) => {
    if (hud.status === "over") return;
    setArmed(null);
    setKeyboardRing(byKeyboard);
    // 마우스로 누른 버튼에 포커스를 주는 브라우저가 있다 — 남은 포커스가 Enter를 엉뚱한 슬롯으로 보내지 않게 놓는다
    if (!byKeyboard && lastPointerRef.current === "mouse") slotButtons.current[slot]?.blur();
    // 다음 클릭은 다음 pointerdown이 정한다 — 포인터 없이 클릭을 합성하는 보조기기가 이전 'mouse'를 물려받지 않게
    lastPointerRef.current = "";
    setSelected((current) => (current === slot ? null : slot));
  };

  const tapOption = useCallback(
    (option: RingOption) => {
      const next = tapRing(armed, option);
      setArmed(next.armed);
      if (!next.command) return;
      const ok = dispatch(next.command.op, next.command.a, next.command.b);
      // 건설·판매 뒤에는 닫고, 업그레이드·타게팅은 같은 슬롯을 열어 둔다(연속 업그레이드)
      if (ok && (next.command.op === OP.BUILD || next.command.op === OP.SELL)) close();
    },
    [armed, dispatch, close],
  );

  const callWave = useCallback(() => {
    dispatch(OP.CALL_WAVE);
  }, [dispatch]);

  // 데스크톱 단축키 (§F3): 1~6 타워 · U 업그레이드 · A/B 분기 · S 판매 · T 타게팅 · Space 호출 · P/Esc 일시정지 · F 배속
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 길게 누름(반복)·한글 조합 중·결과 화면에서는 단축키를 쓰지 않는다 — 2탭 확정이 반복 키로 풀리지 않게(§F0-2)
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || finished) return;
      const key = shortcutOf(e);
      if (key === null) return;
      if (key === " ") {
        if (isTextInput(e.target)) return;
        e.preventDefault();
        callWave();
        return;
      }
      if (key === "Escape" && selected !== null) {
        close();
        return;
      }
      if (key === "P" || key === "Escape") {
        togglePause();
        return;
      }
      if (key === "F") {
        cycleSpeed();
        return;
      }
      const option = options.find((o) => o.shortcut === key);
      if (option) {
        e.preventDefault();
        tapOption(option);
      }
    };
    // 버튼의 Space 누르기는 keyup에서 일어나는 브라우저가 있다(Firefox 등) — keydown과 같이 keyup도 막는다
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !finished && !isTextInput(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [options, selected, finished, callWave, close, togglePause, cycleSpeed, tapOption]);

  const nextIndex = nextWaveIndex(stateRef.current, stage);
  const preview = useMemo(() => (nextIndex === null ? [] : wavePreview(stage, nextIndex)), [stage, nextIndex]);
  const viewport = canvas.viewport;
  const nextMeta = CAMPAIGN[meta.number] ?? null;
  const slotSize = useMemo(() => {
    if (!viewport) return SLOT_BUTTON;
    let min = Infinity;
    const slots = stage.map.slots;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) min = Math.min(min, Math.hypot(slots[i].x - slots[j].x, slots[i].y - slots[j].y));
    }
    return Math.min(SLOT_BUTTON, Math.floor(min * viewport.scale));
  }, [viewport, stage]);

  return (
    <main className="flex h-full flex-col" aria-label={`스테이지 ${meta.number} ${DIFFICULTY_NAMES[difficulty]}`}>
      <Hud hud={hud} exitHref={exitHref} onTogglePause={togglePause} onCycleSpeed={cycleSpeed} />
      <div className="relative min-h-0 flex-1" ref={canvas.containerRef} data-testid="defense-board" data-status={hud.status}>
        <canvas ref={canvas.bgRef} className="absolute inset-0" aria-hidden="true" />
        <canvas ref={canvas.fgRef} className="absolute inset-0" aria-hidden="true" onPointerDown={close} />
        {viewport &&
          stage.map.slots.map((spot, i) => {
            const tower = stateRef.current.towers.find((t) => t.slot === i);
            const label = tower ? `${TOWER_NAMES[tower.kind]} Lv${tower.level}` : "빈 자리";
            return (
              <button
                key={i}
                ref={(el) => {
                  slotButtons.current[i] = el;
                }}
                type="button"
                data-testid={`defense-slot-${i}`}
                data-tower={tower ? tower.kind : ""}
                data-level={tower ? tower.level : 0}
                aria-label={`슬롯 ${i + 1} — ${label}`}
                aria-pressed={selected === i}
                disabled={hud.status === "over"}
                onPointerDown={(e) => {
                  lastPointerRef.current = e.pointerType;
                }}
                // detail 0 = 키보드(Enter·Space)로 누른 클릭
                onClick={(e) => selectSlot(i, e.detail === 0)}
                className="absolute rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                style={{ left: toScreenX(viewport, spot.x) - slotSize / 2, top: toScreenY(viewport, spot.y) - slotSize / 2, width: slotSize, height: slotSize }}
              />
            );
          })}
        {viewport && selected !== null && options.length > 0 && (
          <TowerRing
            key={selected}
            options={options}
            anchor={{ x: toScreenX(viewport, stage.map.slots[selected].x), y: toScreenY(viewport, stage.map.slots[selected].y) }}
            bounds={{ width: viewport.width, height: viewport.height }}
            armed={armed}
            focusOnOpen={keyboardRing}
            onTap={tapOption}
          />
        )}
        {hud.status === "paused" && !finished && (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1 text-xs text-slate-200" role="status">
            일시정지 — 지금도 건설할 수 있어요
          </p>
        )}
        {hud.status === "ready" && !finished && (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900/90 px-3 py-1 text-xs text-slate-200" role="status">
            돌 받침을 눌러 타워를 짓고 웨이브를 시작하세요
          </p>
        )}
        {finished && (
          <ResultPanel
            result={finished.result}
            stars={finished.stars}
            replaySaved={finished.replaySaved}
            progressSaved={finished.progressSaved}
            nextHref={nextMeta ? stagePath(nextMeta.id) : null}
            exitHref={exitHref}
            onRetry={onRetry}
          />
        )}
      </div>
      <WaveBar hud={hud} preview={preview} onCall={callWave} />
    </main>
  );
}
