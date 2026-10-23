"use client";

import { useEffect, useState } from "react";
import { DEFENSE_SESSION_TTL_MS } from "../lib/rankedBoards";

/**
 * 세션 시계 (defense DESIGN §B3·§F9b·§F10 useSessionClock) — 받은 뒤 이 기기에서 흐른 시간으로만 판정(기기 시계가 틀려도 안전)
 * ok → warn(만료 30분 전 — "시간 안에 끝내야 등록") → expired(만료 1분 전부터 — 등록 불가, 계속 플레이)
 * rAF 밖 30초 타이머 + 화면 복귀(visibilitychange) 때 즉시 다시 판정
 */
export type SessionClock = "none" | "ok" | "warn" | "expired";

/** 디펜스 세션 TTL(벽시계) — 서버와 같은 값 한 곳(lib/rankedBoards) */
export const SESSION_TTL_MS = DEFENSE_SESSION_TTL_MS;
export const SESSION_WARN_BEFORE_MS = 30 * 60 * 1000;
/** 제출 왕복·검증 여유 — 이보다 가까우면 등록하지 않는다 */
export const SESSION_EXPIRE_MARGIN_MS = 60 * 1000;
const TICK_MS = 30 * 1000;

export function sessionClockAt(receivedAt: number | null, now: number): SessionClock {
  if (receivedAt === null) return "none";
  const left = receivedAt + SESSION_TTL_MS - now;
  if (left <= SESSION_EXPIRE_MARGIN_MS) return "expired";
  return left <= SESSION_WARN_BEFORE_MS ? "warn" : "ok";
}

export function useSessionClock(receivedAt: number | null): SessionClock {
  const [clock, setClock] = useState<SessionClock>(() => sessionClockAt(receivedAt, Date.now()));
  useEffect(() => {
    const update = () => setClock(sessionClockAt(receivedAt, Date.now()));
    update();
    if (receivedAt === null) return;
    const timer = setInterval(update, TICK_MS);
    const onVisibility = () => {
      if (!document.hidden) update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [receivedAt]);
  return clock;
}
