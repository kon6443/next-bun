"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/app/teams/components";
import { pendingGarbageLines } from "../../battle-engine";
import { DEFAULT_ARR, DEFAULT_DAS } from "../../engine";
import { nextRandom } from "../../engine/random";
import { useReducedEffects } from "../../hooks/useReducedEffects";
import type { ReceivedEmote } from "../contexts/BattleSocketContext";
import { useAttackTrails } from "../hooks/useAttackTrails";
import { useBattlePlay } from "../hooks/useBattlePlay";
import { decodeBoard, encodeBoard } from "../lib/boardCodec";
import { type FakeOpponent, createFakeOpponents, sendGarbageTo, stepFakeOpponents } from "../lib/fakeOpponents";
import { BattleView, type OpponentView } from "./BattleView";

const ME = "me";
const BOT_NAMES = ["민트초코", "Tetrominos", "블록장인"];
const COUNTDOWN_MS = 3000;
/** 봇은 줄을 거의 못 지우므로 게이지·궤적을 보려고 이 간격마다 무작위 봇이 공격한다 */
const BOT_ATTACK_INTERVAL_FRAMES = 240;

type Phase = { status: "countdown"; endsAt: number } | { status: "playing" } | { status: "over"; place: number };

/**
 * 대전 화면 미리보기 (개발 전용) — 서버 매치(P2) 전에 레이아웃·미니보드·게이지·궤적·연출을 가짜 상대로 확인한다
 * 같은 시드의 봇 1~3명과 대전 래퍼로 실제 공격·상쇄·가비지를 주고받는다
 */
export function BattlePreview({ opponentCount, seed }: { opponentCount: number; seed: number }) {
  const router = useRouter();
  const reduced = useReducedEffects();
  const { rootRef, fire } = useAttackTrails(reduced);
  const botsRef = useRef<FakeOpponent[]>([]);
  const targetCursorRef = useRef(0);
  const myGarbageIdRef = useRef(1);
  const rngRef = useRef(seed | 0);
  const [opponents, setOpponents] = useState<OpponentView[]>([]);
  /** 내 다음 공격 대상 — 루프 콜백은 같은 틱 안에서 여러 번 불리므로 렌더를 기다리지 않는 ref로 둔다(표시는 refreshOpponents) */
  const targetIdRef = useRef<string | null>(null);
  const setTargetId = (id: string | null) => {
    targetIdRef.current = id;
  };
  const [phase, setPhase] = useState<Phase>({ status: "countdown", endsAt: 0 });
  const [now, setNow] = useState(0);
  const [emotes, setEmotes] = useState<Record<string, ReceivedEmote>>({});

  const random = (range: number) => {
    const [next, value] = nextRandom(rngRef.current);
    rngRef.current = next;
    return value % range;
  };

  const alive = () => botsRef.current.filter((b) => b.place === null);

  /** 미니보드 표시 갱신 — 판은 서버 중계처럼 인코딩 → 디코딩을 거친다 */
  const refreshOpponents = useCallback((target: string | null) => {
    setOpponents(
      botsRef.current.map((b) => ({
        playerId: b.playerId,
        name: b.name,
        cells: decodeBoard(encodeBoard(b.bs.game.board)),
        pending: pendingGarbageLines(b.bs),
        isTarget: b.playerId === target,
        place: b.place,
        kos: b.kos,
      })),
    );
  }, []);

  /** 생존자 중 다음 대상 (자동 순환 — DESIGN §6 A) */
  const nextTarget = useCallback((): string | null => {
    const list = botsRef.current.filter((b) => b.place === null);
    if (list.length === 0) return null;
    targetCursorRef.current = (targetCursorRef.current + 1) % list.length;
    return list[targetCursorRef.current].playerId;
  }, []);

  const play = useBattlePlay({
    onLock: (lock) => {
      if (lock.sent <= 0) return;
      const target = botsRef.current.find((b) => b.playerId === targetIdRef.current && b.place === null) ?? alive()[0];
      if (!target) return;
      sendGarbageTo(target, lock.sent, random(10));
      fire(ME, target.playerId, lock.sent);
      const next = nextTarget();
      setTargetId(next);
      refreshOpponents(next);
    },
    onFrame: (bs) => {
      let changed = false;
      stepFakeOpponents(botsRef.current, (bot, lock) => {
        changed = true;
        if (lock.sent > 0) {
          play.receive({ id: myGarbageIdRef.current++, lines: lock.sent, hole: random(10) });
          fire(bot.playerId, ME, lock.sent);
        }
      });
      // 탈락 — 락 아웃·가비지 탑아웃(고정 때)과 블록 아웃(생성 때, 고정 없음) 모두 여기서 본다
      const newlyOut = botsRef.current.filter((b) => b.bs.game.over && b.place === null);
      if (newlyOut.length > 0) {
        changed = true;
        // 아직 place가 없는 새 탈락 봇도 alive()에 들어 있고, 이 시점의 나는 살아 있다 → 마지막 순위 = 살아 있는 봇 + 나
        let place = alive().length + 1;
        for (const bot of newlyOut) bot.place = place--;
      }
      if (bs.game.frame % BOT_ATTACK_INTERVAL_FRAMES === 0) {
        const attackers = alive();
        if (attackers.length > 0) {
          const bot = attackers[random(attackers.length)];
          const lines = 1 + random(4);
          play.receive({ id: myGarbageIdRef.current++, lines, hole: random(10) });
          fire(bot.playerId, ME, lines);
        }
      }
      if (changed) {
        const list = alive();
        if (list.length === 0) {
          play.stop();
          setPhase({ status: "over", place: 1 });
        }
        const current = targetIdRef.current;
        const next = current && list.some((b) => b.playerId === current) ? current : (list[0]?.playerId ?? null);
        setTargetId(next);
        refreshOpponents(next);
      }
    },
    onOver: () => {
      setPhase({ status: "over", place: alive().length + 1 });
    },
  });

  const begin = useCallback(() => {
    botsRef.current = createFakeOpponents(seed, BOT_NAMES.slice(0, opponentCount));
    targetCursorRef.current = 0;
    myGarbageIdRef.current = 1;
    const first = botsRef.current[0]?.playerId ?? null;
    setTargetId(first);
    refreshOpponents(first);
    setPhase({ status: "countdown", endsAt: performance.now() + COUNTDOWN_MS });
  }, [seed, opponentCount, refreshOpponents]);

  useEffect(() => {
    begin();
  }, [begin]);

  // 카운트다운 — 끝나면 시작
  const { start } = play;
  useEffect(() => {
    if (phase.status !== "countdown") return;
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t >= phase.endsAt) {
        clearInterval(timer);
        setPhase({ status: "playing" });
        start(seed, DEFAULT_DAS, DEFAULT_ARR);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [phase, start, seed]);

  const overlay =
    phase.status === "countdown" ? (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50" role="status">
        <span className="text-6xl font-black text-white">{Math.max(1, Math.ceil((phase.endsAt - now) / 1000))}</span>
      </div>
    ) : phase.status === "over" ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/70 p-4">
        <div className="w-full max-w-xs rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center">
          <p className="text-xs font-semibold tracking-[0.3em] text-slate-400">PREVIEW</p>
          <h2 className="mt-2 text-3xl font-black text-white">{phase.place === 1 ? "1위!" : `${phase.place}위`}</h2>
          {/* 자동 포커스를 주지 않는다 — 하드 드롭(Space)을 연타하다 탈락하면 바로 다시 시작되므로 */}
          <Button type="button" size="md" fullWidth className="mt-5 min-h-11" onClick={begin}>
            다시 하기
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <BattleView
      play={play}
      meId={ME}
      opponents={opponents}
      emotes={emotes}
      trailsRootRef={rootRef}
      onEmote={(emoteId) => setEmotes((prev) => ({ ...prev, [ME]: { playerId: ME, emoteId, at: new Date().toISOString(), key: Date.now() } }))}
      onExit={() => router.push("/games/tetris/battle")}
      overlay={overlay}
    />
  );
}
