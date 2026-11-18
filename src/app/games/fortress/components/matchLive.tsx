"use client";

import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type MatchFeed, remainingMs } from "../battle-ui/lib/matchFeed";

/**
 * 경기 화면에서 짧은 주기로 바뀌는 값(충전 파워·턴 남은 시간) — FortressMatch 전체를 다시 그리지 않게
 * 값은 여기 작은 저장소·하위 컴포넌트가 들고, FortressMatch는 "충전 시작·표시 시작·끝", "시작 연출 끝·시간 다 됨" 같은 전환에서만 다시 그린다
 */

export type ChargeStore = {
  get: () => number | null;
  set: (value: number | null) => void;
  subscribe: (listener: () => void) => () => void;
};

/** 충전 파워(0~100, 충전 중이 아니면 null) — 경기 화면마다 하나 */
export function createChargeStore(): ChargeStore {
  let value: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** 충전 파워를 구독해 그 부분만 다시 그린다 — 렌더 함수는 FortressMatch의 마지막 렌더 값(파워·핸들러)을 그대로 쓴다 */
export function ChargeLive({ store, children }: { store: ChargeStore; children: (charge: number | null) => ReactNode }) {
  const charge = useSyncExternalStore(store.subscribe, store.get, store.get);
  return <>{children(charge)}</>;
}

type TurnFeed = Pick<MatchFeed, "turn" | "turnAt" | "startAt">;

/** 온라인 턴 표시 주기 — 남은 초 표시가 1초 단위라 이 정도면 충분하다 */
const CLOCK_TICK_MS = 250;

function gateOf(feed: TurnFeed | undefined, now: number) {
  if (!feed) return { started: true, expired: false };
  return { started: now >= feed.startAt, expired: remainingMs(feed, now) <= 0 };
}

/**
 * 온라인 턴 잠금 — 시작 연출이 끝났나·시간이 다 됐나. 바뀔 때만 다시 그린다(남은 초 표시는 TurnTimer가 따로)
 * 판정 주기는 예전(250ms마다 시각을 다시 읽어 렌더 중 계산)과 같다
 */
export function useTurnGate(feed: TurnFeed | undefined): { started: boolean; expired: boolean } {
  const [gate, setGate] = useState(() => gateOf(feed, Date.now()));
  // 마지막으로 그린 판정 — 같으면 setState를 아예 부르지 않는다(같은 값 업데이트도 렌더 한 번을 부를 수 있다)
  const gateRef = useRef(gate);
  gateRef.current = gate;
  // 새 턴 소식이 오면 바로 다시 판정(예전엔 다음 렌더에서 같은 시각으로 계산했다)
  const current = gateOf(feed, Date.now());
  const sameAsState = current.started === gate.started && current.expired === gate.expired;
  const online = feed !== undefined;
  useEffect(() => {
    if (!online) return;
    const id = window.setInterval(() => {
      const next = gateOf(feed, Date.now());
      const prev = gateRef.current;
      if (next.started === prev.started && next.expired === prev.expired) return;
      gateRef.current = next;
      setGate(next);
    }, CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [online, feed]);
  return sameAsState ? gate : current;
}

/** 온라인 턴 타이머 알약 — 이것만 250ms마다 다시 그린다. "곧 시작 N" / "⏱ N초", 5초 이하 경고 */
export function TurnTimer({ feed, warnMs }: { feed: TurnFeed; warnMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  const started = now >= feed.startAt;
  const timeLeft = remainingMs(feed, now);
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${!started ? "border-white/10 bg-slate-900/80 text-slate-300" : timeLeft <= warnMs ? "border-rose-400/60 bg-rose-500/20 text-rose-100" : "border-white/10 bg-slate-900/80 text-slate-200"}`}
      data-testid="fortress-timer"
      data-hud="pill"
    >
      {!started ? `곧 시작 ${Math.ceil((feed.startAt - now) / 1000)}` : `⏱ ${Math.ceil(timeLeft / 1000)}초`}
    </span>
  );
}
