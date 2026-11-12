"use client";

import { useEffect, useRef, useState } from "react";
import { loadReplayEngine } from "../engine-versions";
import { CAMERA_WAIT_POLL_MS, cameraWaitDone } from "../lib/cameraWait";
import { CHIP_BUTTON } from "./fortressUi";
import { WindGauge } from "./WindGauge";
import { slotColor, useBattleView } from "../hooks/useBattleView";
import { type Replay, type ReplayData, buildReplay, stateAt } from "../lib/replay";
import { type Controller, playerName } from "./FortressMatch";
import { type TankSkin, toTankSkin } from "../lib/tankSkins";
import { type Look, lookFromUrl, usesVivid } from "../lib/look";
import vividStyles from "./fortressVivid.module.css";
import { getFortressSound } from "../lib/sound/player";
import { GameSettingsButton } from "@/app/games/_shared/components/GameSettingsButton";
import { FortressSettingsSheet } from "./FortressSettingsSheet";
import type { FortressCue } from "../lib/sound/recipes";

const playReplayCues = (cues: FortressCue[]) => getFortressSound().playCues(cues);

type Loaded = { replay: Replay; hashCheck: HashCheck } | { error: string };
/** 서버 리플레이의 마지막 stateHash와 다시 돌린 결과 대조 — none = 대조할 해시 없음(로컬 기록) */
type HashCheck = "match" | "mismatch" | "none";

type Props = {
  data: ReplayData;
  controllers: Controller[];
  names?: readonly string[];
  /** 탱크 스킨(F7) — slot 순. 없거나 모르는 id는 기본 */
  skins?: readonly TankSkin[];
  /** 서버 리플레이의 마지막 해시 — 주면 다시 돌린 결과와 대조해 로그로 남긴다(F6) */
  expectedHash?: string;
  /** 닫기 문구 — 결과 화면 안에서는 "결과로 돌아가기"(기본), 공유 페이지에서는 다른 문구 */
  closeLabel?: string;
  onClose: () => void;
  /** 그림(보충 5) — 없으면 주소의 ?look(기본 vivid) */
  look?: Look;
};

/** 리플레이 다시 보기 — 기록의 엔진 버전으로 처음부터 다시 돌려(buildReplay) 턴마다 연출한다 */
export function FortressReplay({ data, controllers, names, skins, expectedHash, closeLabel = "결과로 돌아가기", onClose, look: lookProp }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [look] = useState<Look>(() => lookProp ?? lookFromUrl());

  useEffect(() => {
    let alive = true;
    loadReplayEngine(data.engineVersion).then(
      (engine) => {
        if (!alive) return;
        if (!engine) return setLoaded({ error: "이 기록의 엔진 버전은 재생할 수 없어요." });
        const r = buildReplay(engine, data);
        if (!r.ok) return setLoaded({ error: `기록을 재생할 수 없어요. (${r.reason}${r.at >= 0 ? `, ${r.at + 1}번째 행동` : ""})` });
        setLoaded({ replay: r.replay, hashCheck: checkHash(engine.stateHash(r.replay.final), expectedHash, data.actions.length) });
      },
      () => alive && setLoaded({ error: "재생 엔진을 불러오지 못했어요." }),
    );
    return () => {
      alive = false;
    };
  }, [data, expectedHash]);

  if (loaded && "replay" in loaded)
    return <ReplayPlayer replay={loaded.replay} hashCheck={loaded.hashCheck} controllers={controllers} names={names} skins={skins} closeLabel={closeLabel} onClose={onClose} look={look} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm text-slate-300" role={loaded ? "alert" : "status"}>
        {loaded ? loaded.error : "리플레이 준비 중…"}
      </p>
      <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-slate-700 px-4 text-sm text-slate-200">
        {closeLabel}
      </button>
    </div>
  );
}

// 끝에 닿아도 disabled로 바꾸지 않는다(누른 버튼이 disabled가 되면 키보드 포커스가 body로 빠진다) — aria-disabled + 무시
const CONTROL = "min-h-12 min-w-12 rounded-xl border border-white/15 bg-slate-800/80 px-3 text-base text-slate-100 active:bg-slate-700 aria-disabled:opacity-40";

/** 해시 대조 — 결과를 콘솔에 남긴다(서버·엔진 어긋남 탐지). 화면은 재생을 막지 않는다 */
function checkHash(mine: string, expected: string | undefined, actions: number): HashCheck {
  if (!expected) return "none";
  if (mine === expected) {
    console.info(`[fortress] 리플레이 해시 일치 actions=${actions} hash=${mine}`);
    return "match";
  }
  console.warn(`[fortress] 리플레이 해시 불일치 actions=${actions} client=${mine} server=${expected}`);
  return "mismatch";
}

function ReplayPlayer({
  replay,
  hashCheck,
  controllers,
  names,
  skins,
  closeLabel,
  onClose,
  look,
}: {
  replay: Replay;
  hashCheck: HashCheck;
  controllers: Controller[];
  names?: readonly string[];
  skins?: readonly TankSkin[];
  closeLabel: string;
  onClose: () => void;
  look: Look;
}) {
  const total = replay.turns.length;
  /** 끝난 턴 수 — 연출 중이면 turns[index]를 그리는 중 */
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [animating, setAnimating] = useState(false);
  const view = useBattleView({
    initial: replay.initial,
    look,
    // 효과음(D-025 보충 6) — 재생 중 지나간 사건만(일시정지·턴 이동은 진행이 없어 울리지 않는다, 몰리면 중요한 것 몇 개만)
    onCues: playReplayCues,
    labelOf: (slot) => names?.[slot] ?? `P${slot + 1}`,
    skinOf: (slot) => toTankSkin(skins?.[slot]),
    onPlaybackEnd: () => {
      setAnimating(false);
      setIndex((i) => i + 1);
    },
  });
  const { play, show, setPaused, cameraReadyFor } = view;

  useEffect(() => setPaused(!playing), [playing, setPaused]);

  /** 다음 턴을 걸기 전 카메라를 기다리기 시작한 때(턴별) · 다시 확인하라는 신호 — 그 턴을 걸거나 일시정지·이동하면 지운다(다음 방문은 처음부터 기다린다) */
  const waitRef = useRef<{ index: number; since: number } | null>(null);
  const [waitTick, setWaitTick] = useState(0);

  // 재생 중이고 연출이 비면 다음 턴을 건다 — 마지막 턴 뒤엔 멈춘다
  // 둘째 턴부터는 카메라가 그 발을 컷 없이 따라갈 자리에 올 때까지 조금 기다린다(최대 CAMERA_WAIT_MAX_MS, lib/cameraWait)
  useEffect(() => {
    if (!playing) waitRef.current = null;
    if (!playing || animating) return;
    if (index >= total) {
      setPlaying(false);
      return;
    }
    const turn = replay.turns[index];
    if (index > 0) {
      const since = waitRef.current?.index === index ? waitRef.current.since : performance.now();
      waitRef.current = { index, since };
      if (!cameraWaitDone(performance.now() - since, cameraReadyFor(turn.events))) {
        const timer = window.setTimeout(() => setWaitTick((n) => n + 1), CAMERA_WAIT_POLL_MS);
        return () => window.clearTimeout(timer);
      }
    }
    waitRef.current = null;
    play(turn.before, turn.events, turn.after, { weaponId: turn.action.kind === "fire" ? turn.action.weaponId : undefined });
    setAnimating(true);
  }, [playing, animating, index, total, replay, play, cameraReadyFor, waitTick]);

  /** 그 턴 경계로 바로 — 연출 중이던 턴은 버린다(재생 중이면 거기서 이어서) */
  const goTo = (i: number) => {
    const target = Math.max(0, Math.min(total, i));
    show(stateAt(replay, target));
    waitRef.current = null;
    setAnimating(false);
    setIndex(target);
  };
  const toggle = () => {
    if (playing) return setPlaying(false);
    if (index >= total) goTo(0);
    setPlaying(true);
  };

  const shown = stateAt(replay, index);
  /** 지금(연출 중) 또는 다음에 연출할 턴의 행동자 — 표시 "턴 n"도 이 턴 기준이라 이전·다음이 늘 한 칸씩 움직인다 */
  const actor = index < total ? replay.turns[index].actor : null;
  const atStart = index === 0 && !animating;
  const atEnd = index >= total;

  return (
    <div className={`flex h-full flex-col pt-[env(safe-area-inset-top)] ${usesVivid(look) ? vividStyles.vivid : ""}`} data-testid="fortress-replay" data-hash-check={hashCheck} data-look={look}>
      <header className="flex items-center gap-2 px-3 py-2 text-sm" data-hud="bar">
        <button type="button" onClick={onClose} className={CHIP_BUTTON} aria-label={closeLabel} data-hud="chip">
          ←
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          {shown.tanks.map((t) =>
            t ? (
              <span key={t.slot} className={`flex items-center gap-1 ${t.alive ? "" : "opacity-40 line-through"}`}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: slotColor(shown, t.slot) }} aria-hidden />
                <span className={t.slot === actor ? "font-bold text-amber-200" : "text-slate-300"}>{playerName(controllers, t.slot, names)}</span>
                <span className="tabular-nums text-slate-400">{t.hp}</span>
              </span>
            ) : null,
          )}
        </div>
        <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300" data-hud="pill">리플레이</span>
        <GameSettingsButton testId="fortress-settings-button" renderSheet={(close) => <FortressSettingsSheet onClose={close} />} />
      </header>

      <div ref={view.containerRef} className="relative min-h-0 flex-1">
        <canvas ref={view.canvasRef} className="absolute inset-0 block touch-none" {...view.canvasHandlers} aria-label="리플레이 전장 — 끌어서 이동, 두 손가락으로 확대" />
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <WindGauge wind={(index < total ? replay.turns[index].before : shown).wind} turnKey={index} />
        </div>
      </div>

      <section className="border-t border-white/10 bg-slate-900/80 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]" aria-label="리플레이 조작" data-hud="panel">
        <p className="text-center text-sm tabular-nums text-slate-300" aria-live="polite" data-testid="fortress-replay-turn">
          {atEnd ? `끝 · 전체 ${total}턴` : `턴 ${index + 1} / ${total}`}
          {actor !== null ? ` · ${playerName(controllers, actor, names)}` : ""}
        </p>
        <div className="mt-2 flex justify-center gap-2">
          <button type="button" data-hud="key" className={CONTROL} onClick={() => !atStart && goTo(0)} aria-disabled={atStart} aria-label="처음으로">
            ⏮
          </button>
          <button type="button" data-hud="key" className={CONTROL} onClick={() => !atStart && goTo(index - 1)} aria-disabled={atStart} aria-label="이전 턴" data-testid="fortress-replay-prev">
            ◀
          </button>
          <button type="button" data-hud="key" className={`${CONTROL} min-w-20 font-semibold`} onClick={toggle} aria-label={playing ? "일시정지" : "재생"} data-testid="fortress-replay-toggle">
            {playing ? "⏸" : "▶"}
          </button>
          <button type="button" data-hud="key" className={CONTROL} onClick={() => !atEnd && goTo(index + 1)} aria-disabled={atEnd} aria-label="다음 턴" data-testid="fortress-replay-next">
            ▶▶
          </button>
        </div>
      </section>
    </div>
  );
}
