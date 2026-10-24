"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/types/api";
import type { BattleMatch } from "@/services/tetrisBattleService";
import { loadBattleMatch } from "../lib/battleMatchLoader";

/** 저장 대기 조회 간격·한도 — 서버 저장은 예상 제출자가 다 내거나 종료 후 60초 마감 뒤 첫 조회 때 (DESIGN §17-1 ④) */
export const PUBLISH_POLL_MS = 3000;
export const PUBLISH_POLL_LIMIT_MS = 75_000;

export type MatchPublished =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "ready"; match: BattleMatch }
  /** 한도까지 404 — 숨김 또는 저장 실패 (DISPUTED는 200이라 ready, D-008) */
  | { status: "unavailable" };

/**
 * 경기가 저장돼 공개될 때까지 GET으로 기다린다 (DESIGN §18 진입점) — 200이면 멈춘다
 * 마감 뒤 첫 GET이 저장을 일으키므로 다른 참가자가 늦게 내도 한도 안에 열린다
 */
export function useMatchPublished(matchId: string | null): MatchPublished {
  const [state, setState] = useState<MatchPublished>({ status: "idle" });

  useEffect(() => {
    if (!matchId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    setState({ status: "waiting" });

    const poll = async () => {
      try {
        const match = await loadBattleMatch(matchId);
        if (!cancelled) setState({ status: "ready", match });
        return;
      } catch (err) {
        if (cancelled) return;
        // 404(아직 저장 전)·429·네트워크 오류는 한도까지 다시 묻는다
        const retryable = !(err instanceof ApiError) || err.status === 404 || err.status === 429 || err.status >= 500;
        if (!retryable || Date.now() - startedAt + PUBLISH_POLL_MS >= PUBLISH_POLL_LIMIT_MS) {
          setState({ status: "unavailable" });
          return;
        }
      }
      timer = setTimeout(poll, PUBLISH_POLL_MS);
    };
    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId]);

  return state;
}
