"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/types/api";
import { type FortressMatch, getFortressMatch } from "@/services/fortressService";

/**
 * 저장 대기 조회 간격·한도 — 서버는 경기를 끝낸 레플리카가 바로 저장하고(주 경로), 놓치면 크론(30초)·조회 때 저장(lazy)한다
 * (DESIGN §12 저장 흐름). 테트리스 대전 useMatchPublished와 같은 값
 */
export const PUBLISH_POLL_MS = 3000;
export const PUBLISH_POLL_LIMIT_MS = 75_000;

export type MatchPublished =
  | { status: "idle" }
  | { status: "waiting" }
  | { status: "ready"; match: FortressMatch }
  /** 한도까지 404 — 숨김 또는 저장 실패 */
  | { status: "unavailable" };

/**
 * 경기가 저장돼 공개될 때까지 GET으로 기다린다 — 200이면 멈춘다
 * 결과 화면의 기록 보기·공유와, 끊긴 사이 놓친 순위(matchEnded)를 다시 받는 데 쓴다
 */
export function useFortressMatchPublished(matchId: string | null): MatchPublished {
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
        const res = await getFortressMatch(matchId);
        if (!cancelled) setState({ status: "ready", match: res.data });
        return;
      } catch (err) {
        if (cancelled) return;
        // 404(아직 저장 전)·429·5xx·네트워크 오류는 한도까지 다시 묻는다
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
