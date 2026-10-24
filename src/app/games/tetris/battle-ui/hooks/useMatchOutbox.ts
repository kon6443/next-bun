"use client";

import { useCallback, useEffect, useRef } from "react";
import { ACK_TIMEOUT_MS } from "../lib/ackTimeout";
import {
  type LockAckData,
  type LockPayload,
  type TetrisBattleAck,
  TetrisBattleClientEvents,
  TetrisBattleErrorCodes,
  type TetrisBattleSocket,
  type TopOutPayload,
} from "@/types/tetrisBattleSocket";

/** 응답이 없던 보고를 다시 보내기까지 */
const RETRY_MS = 1500;
/** lock·topOut 거절 중 다시 보내면 나아질 수 있는 것 — 그 밖의 거절은 영구(순서·속도 위반 등)라 버린다 (B-a) */
const OUTBOX_RETRYABLE_CODES = new Set<string>([TetrisBattleErrorCodes.SERVICE_UNAVAILABLE]);

type OutboxItem<T> = { payload: T; sending: boolean };
type Outbox = { locks: OutboxItem<LockPayload>[]; topOut: OutboxItem<TopOutPayload> | null };

type MatchOutboxOptions = {
  socketRef: { current: TetrisBattleSocket | null };
  /** 끊긴 뒤 재입장 응답을 기다리는 중 — 이 동안은 보내지 않는다(매치 훅과 함께 쓴다) */
  rejoiningRef: { current: boolean };
  /** lock 응답의 다음 공격 대상 */
  onTarget: (targetId: string | null) => void;
  /** 서버가 이 소켓을 자리에서 뗐다(NOT_IN_ROOM, 재입장 대기 아님) — 토큰 복귀를 부탁한다 */
  onNotInRoom: () => void;
};

/**
 * 매치 보고 송신함 (useBattleMatch에서 분리, FE-24) — lock·topOut을 확인받을 때까지 보관하고 보낸다
 * - lock은 seq 순으로 한 번에 하나씩 — 앞 항목이 확인돼야 다음을 보낸다. topOut은 lock이 모두 끝난 뒤
 *   (서버는 seq가 마지막보다 작으면 LOCK_OUT_OF_ORDER로 거절한다 — 연달아 보내 두면 앞 항목 재전송이 뒤 항목보다 늦게 닿아 그 공격을 잃는다, games-polish FE-10)
 * - 응답이 없거나(끊김·타임아웃) 서버 일시 장애면 보관했다가 잠시 뒤·재입장 응답 뒤 보낸 그대로 다시 보낸다(서버는 같은 seq를 중복으로 무시)
 * - NOT_IN_ROOM이면 재입장 뒤 다시 — 재입장 대기 중이 아니었으면 토큰 복귀를 부탁한다. 그 밖의 응답(성공·거절)이면 그 항목만 끝
 * - 응답은 먼저 같은 매치의 송신함인지 확인한다 — 이전 매치의 늦은 응답이 새 매치 항목을 건드리지 않게
 */
export function useMatchOutbox({ socketRef, rejoiningRef, onTarget, onNotInRoom }: MatchOutboxOptions) {
  const outboxRef = useRef<Outbox>({ locks: [], topOut: null });
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef({ onTarget, onNotInRoom });
  handlersRef.current = { onTarget, onNotInRoom };

  const flush = useCallback(() => {
    const s = socketRef.current;
    if (!s || !s.connected || rejoiningRef.current) return;
    const box = outboxRef.current;
    const retryLater = () => {
      if (retryTimerRef.current) return;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        flushRef.current();
      }, RETRY_MS);
    };
    /** 응답 처리 — 이 항목이 끝났으면 true (다른 매치의 응답이면 아무것도 하지 않는다) */
    const settle = (item: OutboxItem<unknown>, err: Error | null, response: TetrisBattleAck<unknown> | undefined): boolean => {
      if (outboxRef.current !== box) return false;
      item.sending = false;
      if (err || !response) {
        retryLater();
        return false;
      }
      // 서버 일시 장애 — 보낸 그대로 잠시 뒤 다시(서버는 같은 seq를 중복으로 무시한다)
      if (!response.ok && OUTBOX_RETRYABLE_CODES.has(response.code)) {
        retryLater();
        return false;
      }
      if (!response.ok && response.code === TetrisBattleErrorCodes.NOT_IN_ROOM) {
        if (!rejoiningRef.current) {
          rejoiningRef.current = true;
          handlersRef.current.onNotInRoom();
        }
        return false;
      }
      return true;
    };
    const head = box.locks[0];
    if (head && !head.sending) {
      head.sending = true;
      s.timeout(ACK_TIMEOUT_MS).emit(TetrisBattleClientEvents.LOCK, head.payload, (err: Error | null, response?: TetrisBattleAck<LockAckData>) => {
        if (!settle(head, err, response)) return;
        box.locks = box.locks.filter((other) => other !== head);
        if (response?.ok) handlersRef.current.onTarget(response.data.targetId);
        flushRef.current(); // 다음 lock 또는 남은 topOut
      });
    }
    const topOut = box.topOut;
    if (topOut && box.locks.length === 0 && !topOut.sending) {
      topOut.sending = true;
      s.timeout(ACK_TIMEOUT_MS).emit(TetrisBattleClientEvents.TOP_OUT, topOut.payload, (err: Error | null, response?: TetrisBattleAck<unknown>) => {
        if (settle(topOut, err, response) && box.topOut === topOut) box.topOut = null;
      });
    }
  }, [socketRef, rejoiningRef]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  /** 새 매치·대기실로 — 이전 매치의 미확인 보고는 버린다 */
  const reset = useCallback(() => {
    outboxRef.current = { locks: [], topOut: null };
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const pushLock = useCallback(
    (payload: LockPayload) => {
      outboxRef.current.locks.push({ sending: false, payload });
      flush();
    },
    [flush],
  );

  const setTopOut = useCallback(
    (payload: TopOutPayload) => {
      outboxRef.current.topOut = { sending: false, payload };
      flush();
    },
    [flush],
  );

  // 언마운트 — 송신함을 비운다: 늦게 온 응답은 같은 송신함이 아니라 무시되고(재전송·복귀 요청 없음), 재전송 타이머도 정리된다
  useEffect(() => reset, [reset]);

  return { flush, reset, pushLock, setTopOut };
}
