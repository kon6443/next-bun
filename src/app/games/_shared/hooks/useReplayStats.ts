import { useCallback, useEffect, useState } from "react";
import { reportReplayWatch } from "@/services/gameService";
import type { GameType } from "@/types/game";
import { createWatchMeter, recordViewOncePerDay } from "../lib/replayViews";
import { useLazyRef } from "./useLazyRef";

/** 시청 시간 보고 주기 — 탭을 닫는 순간 보고가 유실돼도 잃는 양이 이 주기 안으로 */
export const WATCH_HEARTBEAT_MS = 30_000;

/**
 * 조회 기록(브라우저당 하루 1회) — 서버가 돌려준 조회수(오늘 이미 보냈으면 그때 값), 실패·아직 안 보냄이면 null
 * playable: 재생 데이터를 받아 재생 준비까지 끝났을 때만 센다 — 재생할 수 없는 기록(손상·엔진 버전 불일치)은 세지 않는다
 * 표시는 재생 응답의 viewCount(60초 캐시)와 큰 쪽 — displayedViewCount
 */
export function useRecordedViewCount(gameType: GameType, scoreId: number, playable: boolean): number | null {
  const [viewCount, setViewCount] = useState<number | null>(null);
  useEffect(() => {
    setViewCount(null);
    if (!playable) return;
    let cancelled = false;
    // 같은 기록의 중복 요청은 recordViewOncePerDay가 진행 중인 요청을 함께 써서 막는다(StrictMode 이중 effect)
    recordViewOncePerDay(gameType, scoreId).then((count) => {
      if (!cancelled && count !== null) setViewCount(count);
    });
    return () => {
      cancelled = true;
    };
  }, [gameType, scoreId, playable]);
  return viewCount;
}

/** 머리줄 조회수 — 조회 기록 응답과 재생 응답 중 큰 값(어느 쪽이든 늦을 수 있다), 둘 다 없으면 0 */
export function displayedViewCount(recorded: number | null, fromReplay: number | undefined): number {
  return Math.max(recorded ?? 0, fromReplay ?? 0);
}

/**
 * 시청 시간 보고 — 돌려준 함수로 재생이 진행된 벽시계 ms를 쌓는다(재생 루프의 advanceClock 반환값)
 * 30초마다 쌓인 몫을 보내고, 탭이 숨겨질 때·화면을 떠날 때 keepalive로 남은 몫을 보낸다. 실패한 몫은 버린다(중복보다 유실)
 */
export function useReplayWatchReport(gameType: GameType, scoreId: number): (ms: number) => void {
  const meterRef = useLazyRef(createWatchMeter);
  useEffect(() => {
    const meter = meterRef.current;
    const flush = (keepalive: boolean) => {
      for (const ms of meter.take()) reportReplayWatch(gameType, scoreId, ms, { keepalive }).catch(() => {});
    };
    const timer = window.setInterval(() => flush(false), WATCH_HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      flush(true);
    };
  }, [gameType, scoreId, meterRef]);
  return useCallback((ms: number) => meterRef.current.add(ms), [meterRef]);
}
