"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import {
  type BattleRoomCoreConfig,
  type BattleRoomCoreValue,
  type BattleResult as CoreBattleResult,
  useBattleRoomCore,
} from "@/app/games/_shared/battle-room/contexts/useBattleRoomCore";
import {
  type CreateRoomPayload,
  type EnterRoomAckData,
  FORTRESS_NAMESPACE,
  FortressClientEvents,
  type FortressErrorCode,
  FortressErrorCodes,
  FortressServerEvents,
  type JoinRoomPayload,
  type MatchEndedPayload,
  type MatchSnapshot,
  type MatchStartingPayload,
  type RoomSettings,
  type RoomState,
  type RoomSummary,
  type TurnResolvedPayload,
} from "@/types/fortressSocket";
import { battleErrorMessage } from "../lib/battleErrors";
import { type MatchFeed, mismatchDecision, reduceFeed } from "../lib/matchFeed";
import { clearRoomSession, loadRoomSession, resetRoomSessionForTest, saveRoomSession } from "../lib/roomSession";

export { useEnterScope, type ConnectionStatus } from "@/app/games/_shared/battle-room/contexts/useBattleRoomCore";

export type BattleResult<T> = CoreBattleResult<T, FortressErrorCode>;

/** 내 턴 입력 — 엔진 FireInput에서 kind만 뺀 것(서버가 fire로 만든다) */
export type TurnInput = { move: number; angle: number; power: number; weaponId: number };

/** TURN_MISMATCH 뒤 새 턴 소식을 기다리는 시간(D-015 — 도착 순서는 보장되지 않는다) */
export const MISMATCH_WAIT_MS = 1000;
const MISMATCH_POLL_MS = 50;
/** 놓친 행동을 맞추는 resync가 실패했을 때 다시 시도하는 간격 */
const RESYNC_RETRY_MS = 1000;
/** 방은 끝났는데(RESULT) 경기 소식이 진행 중일 때 마지막 소식을 기다리는 시간 — 지나면 resync */
const STALE_RESULT_WAIT_MS = 1500;

type Core = BattleRoomCoreValue<RoomState, RoomSummary, CreateRoomPayload, JoinRoomPayload, EnterRoomAckData["rejoin"], FortressErrorCode>;

type FortressSocketValue = Core & {
  /** 방장 — 모드·맵·인원(WAITING) */
  updateSettings: (patch: Partial<RoomSettings>) => Promise<BattleResult<unknown>>;
  setTeam: (team: 0 | 1) => Promise<BattleResult<unknown>>;
  setTank: (tankId: number) => Promise<BattleResult<unknown>>;
  /** 지금 경기 — 서버가 확정한 행동 목록(없으면 null) */
  feed: MatchFeed | null;
  /**
   * 내 턴 제출 — 남의 기권으로 seq가 밀리면(TURN_MISMATCH) 같은 입력을 최신 seq로 한 번 다시(D-015).
   * 턴이 이미 지나갔으면 입력을 버리고, 판단할 소식이 없으면 resync
   */
  submitTurn: (input: TurnInput) => Promise<BattleResult<unknown>>;
  /** 서버 스냅샷으로 맞춘다 — 해시가 다르면 마지막으로 적용한 seq·해시를 싣는다(서버 버그 탐지 로그) */
  resync: (report?: { seq: number; clientHash: string }) => Promise<void>;
};

const FortressSocketContext = createContext<FortressSocketValue | null>(null);

const FORTRESS_ROOM_CONFIG: BattleRoomCoreConfig = {
  namespace: FORTRESS_NAMESPACE,
  sessions: { loadRoomSession, saveRoomSession, clearRoomSession, resetRoomSessionForTest },
  errorMessage: battleErrorMessage,
};

/**
 * 포트리스 대전 소켓(F5) — 로비·방·경기가 함께 쓴다(대전 경로 layout에 둬서 로비 → 방 이동 중 연결 유지)
 * 연결·입장·복귀·채팅·이모트는 공용 방 코어, 여기서는 포트리스 방 요청과 경기 피드(matchStarting·turnResolved·matchEnded·스냅샷)를 잇는다
 */
export function FortressSocketProvider({ children }: { children: ReactNode }) {
  const core = useBattleRoomCore<RoomState, RoomSummary, CreateRoomPayload, JoinRoomPayload, EnterRoomAckData["rejoin"], FortressErrorCode>(FORTRESS_ROOM_CONFIG);
  const { socket, roomRequest, socketRequest, registerMatchSync, room } = core;
  const [feed, dispatch] = useReducer(reduceFeed, null);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const roomRef = useRef(room);
  roomRef.current = room;
  /** 진행 중인 resync — 같은 경기는 한 번에 하나만 */
  const resyncingRef = useRef<{ matchId: string; run: Promise<void> } | null>(null);

  const applySnapshot = useCallback((snapshot: MatchSnapshot) => dispatch({ type: "snapshot", snapshot, now: Date.now() }), []);

  /** 그 경기의 스냅샷을 받아 맞춘다 — 이미 요청 중이면 그 요청을 기다린다(이벤트마다 중복 요청 방지) */
  const resyncMatch = useCallback(
    (matchId: string, report?: { seq: number; clientHash: string }) => {
      if (resyncingRef.current?.matchId === matchId) return resyncingRef.current.run;
      const run: Promise<void> = (async () => {
        const result = await socketRequest<MatchSnapshot>(FortressClientEvents.RESYNC, { matchId, ...(report ?? {}) });
        // 그 사이 방을 나갔거나 다른 경기가 시작됐으면 버린다
        const current = feedRef.current;
        if (result.ok && roomRef.current && (!current || current.matchId === matchId)) applySnapshot(result.data);
      })().finally(() => {
        if (resyncingRef.current?.run === run) resyncingRef.current = null;
      });
      resyncingRef.current = { matchId, run };
      return run;
    },
    [socketRequest, applySnapshot],
  );
  const resync = useCallback(
    async (report?: { seq: number; clientHash: string }) => {
      const current = feedRef.current;
      if (current) await resyncMatch(current.matchId, report);
    },
    [resyncMatch],
  );

  // 경기 이벤트 — 다른 경기는 reduceFeed가 버린다. 시작을 놓친 채 턴 소식이 오면 그 경기로 resync
  useEffect(() => {
    if (!socket) return;
    const onStarting = (payload: MatchStartingPayload) => dispatch({ type: "starting", payload, now: Date.now() });
    const onResolved = (payload: TurnResolvedPayload) => {
      if (!feedRef.current) {
        // 시작을 놓친 채 턴 소식이 왔다 — 방 안일 때만 그 경기로 맞춘다(나간 뒤 늦게 온 방송은 버린다)
        if (roomRef.current) void resyncMatch(payload.matchId);
        return;
      }
      dispatch({ type: "resolved", payload, now: Date.now() });
    };
    const onEnded = (payload: MatchEndedPayload) => dispatch({ type: "ended", payload });
    socket.on(FortressServerEvents.MATCH_STARTING, onStarting);
    socket.on(FortressServerEvents.TURN_RESOLVED, onResolved);
    socket.on(FortressServerEvents.MATCH_ENDED, onEnded);
    return () => {
      socket.off(FortressServerEvents.MATCH_STARTING, onStarting);
      socket.off(FortressServerEvents.TURN_RESOLVED, onResolved);
      socket.off(FortressServerEvents.MATCH_ENDED, onEnded);
    };
  }, [socket, resyncMatch]);

  // 재연결 joinRoom ack의 rejoin.match — 경기 중이면 스냅샷으로 복원(덧붙일 필드는 없다)
  useEffect(
    () =>
      registerMatchSync({
        rejoinExtra: () => ({}),
        onRejoin: (rejoin) => {
          if (rejoin?.match) applySnapshot(rejoin.match);
        },
      }),
    [registerMatchSync, applySnapshot],
  );

  // 놓친 행동이 있으면 맞춘다 — resync가 실패(시간 초과 등)하면 맞을 때까지 간격을 두고 다시
  const needsResync = feed?.needsResync ?? false;
  useEffect(() => {
    if (!needsResync) return;
    let cancelled = false;
    void (async () => {
      while (!cancelled && feedRef.current?.needsResync) {
        await resync();
        await new Promise((resolve) => setTimeout(resolve, RESYNC_RETRY_MS));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsResync, resync]);

  // 끊긴 사이 경기가 끝났다(방은 RESULT인데 피드는 진행 중) — 재입장 ack에 경기가 없으니 resync로 마지막 행동까지 받는다
  const roomStatus = room?.status ?? null;
  const stale = roomStatus === "RESULT" && feed !== null && feed.ended === null && feed.turn !== null;
  // 정상 종료에도 방 상태가 마지막 턴 소식보다 먼저 올 수 있어 잠깐 기다린 뒤, 경기마다 한 번만.
  // 그래도 못 받으면 화면(FortressOnlineStage)이 "끝났어요"로 돌린다
  const staleMatchRef = useRef<string | null>(null);
  const staleMatchId = stale ? feed.matchId : null;
  useEffect(() => {
    if (!staleMatchId || staleMatchRef.current === staleMatchId) return;
    const id = setTimeout(() => {
      staleMatchRef.current = staleMatchId;
      void resync();
    }, STALE_RESULT_WAIT_MS);
    return () => clearTimeout(id);
  }, [staleMatchId, resync]);

  // 방을 나가면 경기 피드도 비운다
  const roomCode = room?.code ?? null;
  useEffect(() => {
    if (roomCode === null) dispatch({ type: "clear" });
  }, [roomCode]);

  const updateSettings = useCallback((patch: Partial<RoomSettings>) => roomRequest(FortressClientEvents.UPDATE_SETTINGS, patch), [roomRequest]);
  const setTeam = useCallback((team: 0 | 1) => roomRequest(FortressClientEvents.SET_TEAM, { team }), [roomRequest]);
  const setTank = useCallback((tankId: number) => roomRequest(FortressClientEvents.SET_TANK, { tankId }), [roomRequest]);

  const submitTurn = useCallback(
    async (input: TurnInput): Promise<BattleResult<unknown>> => {
      const current = feedRef.current;
      if (!current?.turn) return { ok: false, code: FortressErrorCodes.MATCH_NOT_FOUND };
      const sent = current.turn;
      const send = (seq: number) => socketRequest(FortressClientEvents.TURN_SUBMIT, { matchId: current.matchId, seq, ...input });
      const first = await send(sent.seq);
      if (first.ok || first.code !== FortressErrorCodes.TURN_MISMATCH) return first;
      // 남의 기권 소식(turnResolved)이 ack보다 늦게 올 수 있다 — 잠깐 기다리며 최신 턴을 본다
      const deadline = Date.now() + MISMATCH_WAIT_MS;
      for (;;) {
        const latest = feedRef.current?.matchId === current.matchId ? (feedRef.current.turn ?? null) : null;
        const decision = mismatchDecision(sent, latest);
        if (decision === "retry" && latest) {
          const retried = await send(latest.seq);
          // 다시 보낸 것도 어긋나면 더 기다리지 않고 맞춘다(재제출은 한 번만)
          if (!retried.ok && retried.code === FortressErrorCodes.TURN_MISMATCH) void resync();
          return retried;
        }
        if (decision === "drop") return first;
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, MISMATCH_POLL_MS));
      }
      void resync();
      return first;
    },
    [socketRequest, resync],
  );

  const value = useMemo<FortressSocketValue>(
    () => ({ ...core, updateSettings, setTeam, setTank, feed, submitTurn, resync }),
    [core, updateSettings, setTeam, setTank, feed, submitTurn, resync],
  );
  return <FortressSocketContext.Provider value={value}>{children}</FortressSocketContext.Provider>;
}

export function useFortressSocket(): FortressSocketValue {
  const value = useContext(FortressSocketContext);
  if (!value) throw new Error("useFortressSocket은 FortressSocketProvider 안에서만 쓸 수 있습니다");
  return value;
}
