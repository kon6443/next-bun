"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomPlayer } from "@/types/tetrisBattleSocket";

/** 대기·결과 단계에서 끊긴 자리를 서버가 정리하기까지의 유예 (D-009) */
export const OFFLINE_GRACE_MS = 10_000;

/**
 * 오프라인 자리별 남은 정리 시간(초) — 대기·결과 단계(active)에서 온라인 → 오프라인 전환을 이 화면이 직접 본 자리만, 본 시각부터 잰다(기기 시계와 무관)
 * 처음 볼 때 이미 오프라인이었거나 경기 중에 끊긴 자리는 서버 유예 시작점(실제로 끊긴 시각)을 몰라 세지 않는다 — "오프라인"만 보인다
 * 세는 자리가 있는 동안만 1초마다 다시 그린다
 */
export function useOfflineCountdown(players: RoomPlayer[], active: boolean): Record<string, number> {
  const sinceRef = useRef(new Map<string, number>());
  /** 마지막으로 본 연결 상태 */
  const seenRef = useRef(new Map<string, boolean>());
  const [now, setNow] = useState(() => Date.now());

  // 렌더 중에 기록한다 — 받은 roomState와 같은 렌더에서 카운트다운이 시작되게(StrictMode 이중 렌더에도 같은 결과)
  const since = sinceRef.current;
  const seen = seenRef.current;
  const present = new Set(players.map((p) => p.playerId));
  for (const id of Array.from(since.keys())) if (!present.has(id)) since.delete(id);
  for (const id of Array.from(seen.keys())) if (!present.has(id)) seen.delete(id);
  for (const p of players) {
    if (p.connected) since.delete(p.playerId);
    else if (active && seen.get(p.playerId) === true && !since.has(p.playerId)) since.set(p.playerId, Date.now());
    seen.set(p.playerId, p.connected);
  }
  const offline = new Set(Array.from(since.keys()));

  const ticking = active && offline.size > 0;
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  if (!active) return {};
  const left: Record<string, number> = {};
  for (const id of offline) {
    // 막 오프라인이 된 자리는 now(마지막 틱)보다 since가 늦을 수 있다 — 지난 시간은 0부터
    const elapsed = Math.max(0, now - (since.get(id) ?? now));
    left[id] = Math.max(0, Math.ceil((OFFLINE_GRACE_MS - elapsed) / 1000));
  }
  return left;
}
