"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/app/teams/components/Button";
import { MAP_IDS, type MapId, type MatchConfig, type MatchMode, SEED_MAX, TANKS } from "../engine";
import { type PerfSnapshot, snapshot } from "../lib/perfProbe";
import type { ReplayData } from "../lib/replay";
import { DEFAULT_TANK_SKIN, type TankSkin } from "../lib/tankSkins";
import { useMyTankSkin } from "../hooks/useMyTankSkin";
import { DEFAULT_LOOK, type Look, lookFromUrl, usesVivid } from "../lib/look";
import { type Controller, FortressMatch } from "./FortressMatch";
import { FortressReplay } from "./FortressReplay";
import { FortressResult } from "./FortressResult";
import { FortressResultVivid } from "./FortressResultVivid";
import { CARD, EYEBROW, choiceClass } from "./fortressUi";
import { SLOT_COLORS, TEAM_COLORS } from "../renderer/drawScene";

/**
 * 포트리스 AI전·핫시트 (F2) — 설정 → 경기 → 결과(요약) → 다시 보기·다시하기. 미노출 경로(/games/fortress/play)
 * ?vs=ai|local 이면 홈 진입 구성(setupForVs), ?seed=n 이면 seed 고정(재현·자동 검증), ?auto=1 이면 전원 AI 상으로 바로 시작(측정용, vs보다 우선), ?perf=1 이면 실측 표시
 */

const MAP_LABELS: Record<MapId, string> = { hills: "언덕", canyon: "협곡" };
const CONTROLLER_OPTIONS: { value: Controller; label: string }[] = [
  { value: "human", label: "사람" },
  { value: 0, label: "AI 하" },
  { value: 1, label: "AI 중" },
  { value: 2, label: "AI 상" },
];

export type Setup = { count: number; mode: MatchMode; mapId: MapId; controllers: Controller[]; tanks: number[] };

const DEFAULT_SETUP: Setup = { count: 2, mode: "ffa", mapId: "hills", controllers: ["human", 1, 1, 1], tanks: [0, 1, 2, 0] };

/** 홈의 진입(?vs=ai|local)이 미리 채우는 구성 — 모르는 값이면 기본 구성(DEFAULT_SETUP) 그대로 */
export type VsPreset = "ai" | "local";
const VS_CONTROLLERS: Record<VsPreset, Controller[]> = {
  // P1 사람 + 나머지 AI 중
  ai: ["human", 1, 1, 1],
  // 한 기기로 돌아가며 — 전원 사람
  local: ["human", "human", "human", "human"],
};

/** ai는 지금 기본 구성과 같다(P1 사람 + AI 중) — 기본이 바뀌어도 홈 "AI와 대전"의 뜻이 유지되게 따로 둔다. 늘 새 배열로 돌려준다 */
export function setupForVs(vs: string | null): Setup {
  const base = { ...DEFAULT_SETUP, tanks: [...DEFAULT_SETUP.tanks], controllers: [...DEFAULT_SETUP.controllers] };
  if (vs !== "ai" && vs !== "local") return base;
  return { ...base, controllers: [...VS_CONTROLLERS[vs]] };
}

function readParams(): { seed: number | null; auto: boolean; perf: boolean; vs: string | null; look: Look } {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("seed");
  const seed = raw !== null && /^\d+$/.test(raw) && Number(raw) <= SEED_MAX ? Number(raw) : null;
  return { seed, auto: params.get("auto") === "1", perf: params.get("perf") === "1", vs: params.get("vs"), look: lookFromUrl() };
}

function toConfig(setup: Setup, seed: number): MatchConfig {
  return {
    seed,
    mapId: setup.mapId,
    mode: setup.mode,
    // team: slot 0·1 = 파랑, 2·3 = 주황
    players: Array.from({ length: setup.count }, (_, slot) => ({ slot, team: setup.mode === "team" ? (slot < 2 ? 0 : 1) : 0, tankId: setup.tanks[slot] })),
  };
}

/**
 * 혼자하기 slot별 스킨(D-025) — 첫 사람 자리(로그인 사용자)만 내 장착 스킨, AI·같은 기기의 다른 사람 자리는 기본
 * 경기 시작 때 정해 경기·결과·다시 보기 내내 같다(다시 보기는 그 경기 당시 스킨). 그리기에만 쓴다 — 기록(ReplayData)·해시와 무관
 * 장착 스킨을 아직 불러오는 중에 시작했으면 응답이 오는 순간 한 번 정한다(느린 망에서 로그인 사용자가 기본 탱크로 경기하지 않게)
 */
export function localSkins(controllers: readonly Controller[], mySkin: TankSkin): TankSkin[] {
  const me = controllers.indexOf("human");
  return controllers.map((_, slot) => (slot === me ? mySkin : DEFAULT_TANK_SKIN));
}

type Screen =
  | { kind: "setup" }
  | { kind: "match"; config: MatchConfig; controllers: Controller[]; skins: TankSkin[]; key: number }
  | { kind: "result"; replay: ReplayData; controllers: Controller[]; skins: TankSkin[] }
  | { kind: "replay"; replay: ReplayData; controllers: Controller[]; skins: TankSkin[] };

export default function FortressPrototype() {
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [screen, setScreen] = useState<Screen>({ kind: "setup" });
  const [perf, setPerf] = useState(false);
  /** 경기 화면 그림(D-025 B·보충 5) — 주소의 ?look(그 탭에 기억), 없으면 기본 vivid. 처음 렌더는 서버와 같은 기본값 */
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const { skin: mySkin, status: mySkinStatus } = useMyTankSkin();
  /** 내 장착 스킨을 불러오는 중에 시작한 경기 — 응답이 오면 그 경기(·결과·다시 보기)의 내 자리 스킨을 한 번 정한다 */
  const skinPendingRef = useRef(false);
  useEffect(() => {
    if (!skinPendingRef.current || mySkinStatus === "loading") return;
    skinPendingRef.current = false;
    setScreen((s) => (s.kind === "setup" ? s : { ...s, skins: localSkins(s.controllers, mySkin) }));
  }, [mySkin, mySkinStatus]);

  useEffect(() => {
    const params = readParams();
    setPerf(params.perf);
    setLook(params.look);
    setSetup(setupForVs(params.vs));
    if (params.auto) {
      const auto: Setup = { count: 4, mode: "ffa", mapId: "canyon", controllers: [2, 2, 2, 2], tanks: [0, 1, 2, 0] };
      setSetup(auto);
      setScreen({ kind: "match", config: toConfig(auto, params.seed ?? 1), controllers: auto.controllers, skins: localSkins(auto.controllers, DEFAULT_TANK_SKIN), key: Date.now() });
    }
  }, []);

  const startMatch = () => {
    const fixed = readParams().seed;
    const seed = fixed ?? Math.floor(Math.random() * SEED_MAX);
    const controllers = setup.controllers.slice(0, setup.count);
    skinPendingRef.current = mySkinStatus === "loading";
    setScreen({ kind: "match", config: toConfig(setup, seed), controllers, skins: localSkins(controllers, mySkin), key: Date.now() });
  };
  const toSetup = () => setScreen({ kind: "setup" });

  let body: React.ReactNode;
  if (screen.kind === "match") {
    const { controllers, skins } = screen;
    body = (
      <FortressMatch
        key={screen.key}
        config={screen.config}
        controllers={controllers}
        skins={skins}
        look={look}
        onExit={toSetup}
        onFinish={(replay) => setScreen({ kind: "result", replay, controllers, skins })}
      />
    );
  } else if (screen.kind === "result") {
    const { replay, controllers, skins } = screen;
    const onReplay = () => setScreen({ kind: "replay", replay, controllers, skins });
    body =
      !usesVivid(look) ? (
        <FortressResult data={replay} controllers={controllers} onReplay={onReplay} onRematch={startMatch} onSetup={toSetup} />
      ) : (
        <FortressResultVivid data={replay} controllers={controllers} skins={skins} onReplay={onReplay} onRematch={startMatch} onSetup={toSetup} />
      );
  } else if (screen.kind === "replay") {
    const { replay, controllers, skins } = screen;
    body = <FortressReplay data={replay} controllers={controllers} skins={skins} look={look} onClose={() => setScreen({ kind: "result", replay, controllers, skins })} />;
  } else body = <SetupScreen setup={setup} onChange={setSetup} onStart={startMatch} />;

  return (
    <>
      {body}
      {perf ? <PerfOverlay /> : null}
    </>
  );
}

function SetupScreen({ setup, onChange, onStart }: { setup: Setup; onChange: (s: Setup) => void; onStart: () => void }) {
  const set = (patch: Partial<Setup>) => onChange({ ...setup, ...patch });
  const setCount = (count: number) => set({ count, mode: count === 4 ? setup.mode : "ffa" });
  const setSlot = <K extends "controllers" | "tanks">(key: K, slot: number, value: Setup[K][number]) => {
    const next = [...setup[key]] as Setup[K];
    next[slot] = value;
    set({ [key]: next } as Partial<Setup>);
  };
  const humans = setup.controllers.slice(0, setup.count).filter((c) => c === "human").length;

  return (
    // 루트 layout이 이미 <main>으로 감싼다 — 중첩하지 않는다
    <div className="h-full bg-gradient-to-b from-[#070b1d] via-[#141a3d] to-[#2a2350] overflow-y-auto overscroll-contain px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]" style={{ touchAction: "pan-y" }}>
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header className={CARD}>
          <div className="flex items-center justify-between">
            <p className={EYEBROW}>FORTRESS</p>
            <Link href="/games/fortress" className="flex min-h-11 items-center px-2 text-xs text-sky-300">
              ← 포트리스
            </Link>
          </div>
          <h1 className="mt-1 text-3xl font-bold text-white [text-shadow:0_0_14px_rgba(56,189,248,0.6)]">포트리스</h1>
          <p className="mt-2 text-sm text-slate-400">바람을 읽고 각도와 파워를 맞춰 상대 탱크를 맞히세요. 한 기기로 돌아가며 쏘거나(핫시트) AI와 붙어 볼 수 있어요.</p>
          <p className="mt-3 inline-block rounded-full border border-slate-700/60 bg-slate-900/70 px-3 py-1 text-xs text-slate-400">AI·같은 기기 대전은 기록이 저장되지 않아요</p>
        </header>

        <section className={`${CARD} flex flex-col gap-4`} aria-label="경기 설정">
          <Field label="인원">
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" className={choiceClass(setup.count === n)} aria-pressed={setup.count === n} onClick={() => setCount(n)}>
                {n}명
              </button>
            ))}
          </Field>
          <Field label="모드" hint={setup.count !== 4 ? "팀전은 4명일 때만 할 수 있어요." : undefined}>
            <button type="button" className={choiceClass(setup.mode === "ffa")} aria-pressed={setup.mode === "ffa"} onClick={() => set({ mode: "ffa" })}>
              개인전
            </button>
            <button type="button" className={choiceClass(setup.mode === "team")} aria-pressed={setup.mode === "team"} disabled={setup.count !== 4} onClick={() => set({ mode: "team" })}>
              팀전 2:2
            </button>
          </Field>
          <Field label="맵">
            {MAP_IDS.map((id) => (
              <button key={id} type="button" className={choiceClass(setup.mapId === id)} aria-pressed={setup.mapId === id} onClick={() => set({ mapId: id })}>
                {MAP_LABELS[id]}
              </button>
            ))}
          </Field>
        </section>

        <section className="flex flex-col gap-3" aria-label="플레이어">
          {Array.from({ length: setup.count }, (_, slot) => (
            <div key={slot} className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: setup.mode === "team" ? TEAM_COLORS[slot < 2 ? 0 : 1] : SLOT_COLORS[slot] }} aria-hidden />
                P{slot + 1}
                {setup.mode === "team" ? <span className="text-xs font-normal text-slate-400">{slot < 2 ? "파랑 팀" : "주황 팀"}</span> : null}
              </p>
              <div className="flex gap-1.5" role="group" aria-label={`P${slot + 1} 조작`}>
                {CONTROLLER_OPTIONS.map((o) => (
                  <button key={o.label} type="button" className={choiceClass(setup.controllers[slot] === o.value)} aria-pressed={setup.controllers[slot] === o.value} onClick={() => setSlot("controllers", slot, o.value)}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5" role="group" aria-label={`P${slot + 1} 탱크`}>
                {TANKS.map((t) => (
                  <button key={t.id} type="button" className={choiceClass(setup.tanks[slot] === t.id)} aria-pressed={setup.tanks[slot] === t.id} onClick={() => setSlot("tanks", slot, t.id)}>
                    {t.name}
                    <span className="block text-[10px] text-slate-400">
                      HP {t.hp} · 연료 {t.fuel}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <Button type="button" size="md" fullWidth className="min-h-12 text-base" onClick={onStart}>
          시작
        </Button>
        <p className="text-center text-xs text-slate-500">{humans >= 2 ? "사람끼리는 한 기기를 차례대로 넘겨 가며 쏴요. " : ""}조작 방법은 경기 화면 오른쪽 위 ? 에서 볼 수 있어요.</p>
      </div>
    </div>
  );
}

/** 설정 한 줄 — 라벨 + 선택 칸 */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-sm font-semibold text-white">{label}</p>
      <div className="flex gap-2">{children}</div>
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function PerfOverlay() {
  const [snap, setSnap] = useState<PerfSnapshot | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setSnap(snapshot()), 500);
    return () => window.clearInterval(id);
  }, []);
  if (!snap) return null;
  const think = Object.entries(snap.think)
    .map(([k, v]) => `${k} ${v.length ? Math.max(...v) : 0}ms`)
    .join(" · ");
  return (
    <div className="pointer-events-none fixed right-2 top-[calc(3.25rem+env(safe-area-inset-top))] rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300">
      <div>
        frame avg {snap.frameAvg} p95 {snap.frameP95} max {snap.frameMax} (n {snap.frames})
      </div>
      <div>
        draw avg {snap.drawAvg} max {snap.drawMax}
      </div>
      <div>{think || "think -"}</div>
    </div>
  );
}
