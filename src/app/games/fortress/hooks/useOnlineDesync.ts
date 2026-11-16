import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { type MatchState, stateHash } from "../engine";
import type { OnlineLink } from "../components/FortressMatch";

/** 서버와 어긋나 resync한 횟수 상한 — 넘으면 멈추고 새로고침을 안내 */
const MAX_DESYNC_RESYNCS = 3;

/**
 * 온라인 경기의 서버 대조(F5) — 행동마다 서버 해시와 비교해 다르면 resync, 몇 번까지만 하고 그래도 안 맞으면 멈추고 새로고침 안내
 * (끝없는 resync·재시뮬레이션 방지). 처음 받은 피드를 내 엔진이 끝까지 적용하지 못했으면(bootOk false) 마운트 때 한 번 resync
 */
export function useOnlineDesync(onlineRef: RefObject<OnlineLink | undefined>, bootOk: boolean) {
  /** 서버와 맞추지 못한 횟수 — 같은 경기에서 이만큼 넘으면 resync를 멈추고 새로고침을 안내(엔진 사본 어긋남 등) */
  const desyncCountRef = useRef(0);
  const [desyncFatal, setDesyncFatal] = useState(false);
  const desyncReloadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (desyncFatal) desyncReloadRef.current?.focus();
  }, [desyncFatal]);

  const requestResync = useCallback(
    (report?: { seq: number; clientHash: string }) => {
      const link = onlineRef.current;
      if (!link) return;
      desyncCountRef.current += 1;
      if (desyncCountRef.current > MAX_DESYNC_RESYNCS) {
        setDesyncFatal(true);
        return;
      }
      link.resync(report);
    },
    [onlineRef],
  );

  // 재구성 경로와 같이 맞춘다(StrictMode 두 번 실행에도 한 번)
  const bootCheckedRef = useRef(false);
  useEffect(() => {
    if (bootCheckedRef.current) return;
    bootCheckedRef.current = true;
    if (!bootOk) requestResync();
  }, [bootOk, requestResync]);

  /** 행동 count개를 적용한 state가 서버 해시와 다르면 resync(마지막 적용 수·내 해시를 싣는다) — 맞으면(또는 비교할 값이 없으면) true */
  const verifyHash = useCallback(
    (count: number, s: MatchState) => {
      const link = onlineRef.current;
      const expected = link?.feed.hashes[count - 1];
      if (!link || !expected) return true;
      const mine = stateHash(s);
      if (mine === expected) return true;
      console.warn(`[fortress] 해시 불일치 seq=${count} client=${mine} server=${expected} — resync`);
      requestResync({ seq: count, clientHash: mine });
      return false;
    },
    [onlineRef, requestResync],
  );

  /** 스냅샷으로 맞았다 — 그동안의 어긋남은 풀렸으니 다시 센다 */
  const resetDesyncCount = useCallback(() => {
    desyncCountRef.current = 0;
  }, []);

  return { desyncFatal, desyncReloadRef, requestResync, verifyHash, resetDesyncCount };
}
