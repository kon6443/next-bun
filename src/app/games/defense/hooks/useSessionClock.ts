"use client";

import { useEffect, useState } from "react";
import { DEFENSE_SESSION_TTL_MS } from "../lib/rankedBoards";

/**
 * 세션 시계 (defense DESIGN §B3·§F9b·§F10 useSessionClock) — 받은 순간의 남은 시간(ttlMs, 응답 ttlSeconds·없으면 expiresAt 기준 — _shared/lib/sessionTtl)과
 * 받은 뒤 이 기기에서 흐른 시간으로 판정한다(games-polish P3 — 4시간 하드코딩 대신, 테트리스와 같은 규칙)
 * ok → warn(만료 30분 전 — "시간 안에 끝내야 등록") → expired(만료 1분 전부터 — 등록 불가, 계속 플레이)
 * rAF 밖 30초 타이머 + 화면 복귀(visibilitychange) 때 즉시 다시 판정
 */
export type SessionClock = "none" | "ok" | "warn" | "expired";

/** 디펜스 세션 TTL 상한(서버 4시간) — 응답 남은 시간이 이보다 길게 잡히거나 없으면(옛 이어하기 저장본) 이 값 */
export const SESSION_TTL_MS = DEFENSE_SESSION_TTL_MS;
export const SESSION_WARN_BEFORE_MS = 30 * 60 * 1000;
/** 제출 왕복·검증 여유 — 이보다 가까우면 등록하지 않는다 */
export const SESSION_EXPIRE_MARGIN_MS = 60 * 1000;
const TICK_MS = 30 * 1000;

export function sessionClockAt(receivedAt: number | null, now: number, ttlMs: number = SESSION_TTL_MS): SessionClock {
  if (receivedAt === null) return "none";
  const left = receivedAt + ttlMs - now;
  if (left <= SESSION_EXPIRE_MARGIN_MS) return "expired";
  return left <= SESSION_WARN_BEFORE_MS ? "warn" : "ok";
}

export function useSessionClock(receivedAt: number | null, ttlMs: number = SESSION_TTL_MS): SessionClock {
  const [clock, setClock] = useState<SessionClock>(() => sessionClockAt(receivedAt, Date.now(), ttlMs));
  useEffect(() => {
    const update = () => setClock(sessionClockAt(receivedAt, Date.now(), ttlMs));
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
  }, [receivedAt, ttlMs]);
  return clock;
}
