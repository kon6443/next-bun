"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GarbagePayload,
  type MatchResultEntry,
  type RejoinData,
  type RoomState,
  TetrisBattleClientEvents,
  TetrisBattleServerEvents,
  type TetrisBattleSocket,
} from "@/types/tetrisBattleSocket";
import { type BattleReplayInput, type BattleState, pendingGarbageLines } from "../../battle-engine";
import type { MatchSync } from "../contexts/BattleSocketContext";
import { decodeBoard, encodeBoard } from "../lib/boardCodec";
import type { ReplaySubmitStatus } from "../lib/replaySubmit";
import { useBattlePlay } from "./useBattlePlay";
import { ACK_TIMEOUT_MS, useMatchOutbox } from "./useMatchOutbox";
import { getSoundPlayer } from "../../lib/sound/soundPlayer";

/** 승리음은 마지막 KO 폭발음 뒤에 */
const WIN_SOUND_DELAY_MS = 450;

/** 방이 RESULT가 됐는데 matchEnded가 아직 없으면 이만큼 기다린다 — 서버 경로에 따라 roomState가 먼저 온다(FE-17·BE-22) */
export const RESULT_WAIT_MS = 1500;

/**
 * 매치 진행 단계
 * - idle: 이 기기에 진행 중인 매치가 없다(대기실)
 * - countdown: matchStarting을 받아 시작 시각을 기다린다
 * - playing: 내 판 진행 중
 * - out: 나는 탈락(남은 경기는 관전)
 * - ended: 경기 종료 — results가 비었으면 끊긴 사이 끝나 결과를 받지 못한 것
 * - unavailable: 방은 경기 중인데 이 기기에 판이 없다(경기 중 새로고침 등 — DESIGN §16 복귀 불가)
 *   forfeited = 살아 있던 내 자리를 topOut(frame 0)으로 기권 처리했다(D-020). 리플레이는 제출하지 않는다(서버가 "리플레이 없음 = 기권")
 */
export type MatchPhase =
  | { kind: "idle" }
  | { kind: "countdown"; matchId: string; startsAt: number }
  | { kind: "playing"; matchId: string }
  | { kind: "out"; matchId: string; place: number | null }
  | { kind: "ended"; matchId: string | null; results: MatchResultEntry[] }
  | { kind: "unavailable"; forfeited: boolean };

export type OpponentState = {
  playerId: string;
  name: string;
  /** 보이는 200칸 — 아직 받은 판이 없으면 null */
  cells: Uint8Array | null;
  pending: number;
  /** 탈락 순위 — 살아 있으면 null */
  place: number | null;
  /** 탈락했지만 순위를 아직 모른다 — 재입장 응답(alive=false)으로 알았고 순위는 뒤이은 playerKO가 채운다 */
  out?: boolean;
  kos: number;
};

type BattleMatchOptions = {
  socket: TetrisBattleSocket | null;
  room: RoomState;
  myPlayerId: string | null;
  das: number;
  arr: number;
  registerMatchSync: (sync: MatchSync) => () => void;
  /** 서버가 이 소켓을 자리에서 뗐다(NOT_IN_ROOM) — 토큰 복귀를 부탁한다. 결과는 registerMatchSync의 onRejoin으로 온다 */
  recoverSeat?: () => void;
  /** 공격 궤적 (attack 이벤트 — 내 공격 포함) */
  onAttack?: (from: string, to: string, lines: number) => void;
  /** 경기 후 리플레이 제출 (DESIGN §17-1) — 이 기기에 그 매치의 판이 있을 때만 매치당 1회 부른다 */
  submitReplay?: (matchId: string, replay: BattleReplayInput) => Promise<Exclude<ReplaySubmitStatus, "submitting">>;
};

/** 결과 화면에 보일 제출 상태 — 매치 id로 묶는다(재대결 뒤에도 이전 제출은 끝까지 간다) */
export type ReplaySubmitState = { matchId: string; status: ReplaySubmitStatus };

type GarbageEvent = Pick<GarbagePayload, "id" | "lines" | "hole">;


/**
 * 대전 매치 연동 — 서버 이벤트(matchStarting·garbage·attack·opponentUpdate·playerKO·matchEnded)를 받아
 * 내 판(useBattlePlay)을 진행하고, 블록 고정마다 lock, 탈락 때 topOut을 보낸다 (DESIGN §8·§16)
 *
 * 받은 가비지: 판이 시작되기 전(카운트다운)과 재연결 중(끊김 → 재입장 응답)에는 모아 두었다가 id 오름차순·중복 없이 넣는다
 * — 서버는 재입장 응답(missedGarbage)보다 실시간 garbage를 먼저 보낼 수 있고, receiveGarbage는 직전 id 이하를 버리므로 순서가 중요하다
 * lock·topOut은 송신함(outbox)으로 보낸다 — 끊긴 동안·재입장 대기 중에는 보내지 않고, 확인받을 때까지 보관했다가 다시 보낸다
 */
export function useBattleMatch({ socket, room, myPlayerId, das, arr, registerMatchSync, recoverSeat, onAttack, submitReplay }: BattleMatchOptions) {
  const [phase, setPhaseState] = useState<MatchPhase>({ kind: "idle" });
  const [opponents, setOpponents] = useState<OpponentState[]>([]);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [myKos, setMyKos] = useState(0);
  const [replaySubmit, setReplaySubmit] = useState<ReplaySubmitState | null>(null);
  const submitReplayRef = useRef(submitReplay);
  submitReplayRef.current = submitReplay;
  const recoverSeatRef = useRef(recoverSeat);
  recoverSeatRef.current = recoverSeat;
  /** 제출을 시작한 매치 — 같은 매치를 두 번 보내지 않는다 */
  const submittedRef = useRef(new Set<string>());
  /**
   * 서버가 탈락시킨 매치(끊김 유예 초과·재입장 응답 alive=false) — 로컬 판은 탑아웃하지 않아 서버 탈락 frame과 맞지 않으므로 제출하지 않는다
   * 제출하지 않으면 MISSING(경기는 VERIFIED 유지), 제출하면 INVALID(경기가 DISPUTED)
   */
  const serverKoRef = useRef(new Set<string>());
  /**
   * 내 topOut으로 탈락이 확정된 매치(topout KO + 내 판이 끝남) — 서버의 "예상 제출자"(D-022 ④)라 꼭 제출한다
   * 이후 관전 중 끊겼다 재입장해 alive=false가 와도 서버 탈락으로 덮지 않는다
   */
  const selfTopOutRef = useRef(new Set<string>());

  const phaseRef = useRef<MatchPhase>(phase);
  const setPhase = useCallback((next: MatchPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  /** 서버가 알려 준 현재 매치 */
  const matchIdRef = useRef<string | null>(null);
  /** 내 판(battleRef)이 어느 매치의 것인지 — 시작 전이거나 다른 매치 판이면 null·다른 값 */
  const playingMatchIdRef = useRef<string | null>(null);
  /** 아직 판에 넘기지 않은 가비지 (시작 전·재연결 중) */
  const heldGarbageRef = useRef<GarbageEvent[]>([]);
  /** 끊긴 뒤 재입장 응답을 기다리는 중 */
  const rejoiningRef = useRef(false);
  const socketRef = useRef(socket);
  socketRef.current = socket;
  const myIdRef = useRef(myPlayerId);
  myIdRef.current = myPlayerId;
  const onAttackRef = useRef(onAttack);
  onAttackRef.current = onAttack;
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 승리음 지연 — 화면을 떠나면 울리지 않게 정리한다 */
  const winSoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSocketRef = useRef<TetrisBattleSocket | null>(null);

  /** 방이 RESULT가 된 뒤 matchEnded를 기다리는 타이머 */
  const resultWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // lock·topOut 송신함 — 확인받을 때까지 보관·재전송 (useMatchOutbox)
  const outbox = useMatchOutbox({
    socketRef,
    rejoiningRef,
    onTarget: setTargetId,
    onNotInRoom: () => recoverSeatRef.current?.(),
  });
  const { flush: flushOutbox, reset: resetOutbox, pushLock, setTopOut } = outbox;

  const queueLock = useCallback(
    (bs: BattleState, sent: number, perfectClear: boolean) => {
      const matchId = playingMatchIdRef.current;
      const engineLock = bs.game.lastLock;
      if (!matchId || !engineLock) return;
      pushLock({
        matchId,
        // 서버는 seq 건너뛰기를 허용한다 — 반드시 game.pieces 그대로
        seq: bs.game.pieces,
        frame: engineLock.frame,
        sent,
        combo: engineLock.combo,
        b2b: engineLock.backToBack,
        tSpin: engineLock.tSpin,
        lines: engineLock.lines,
        pc: perfectClear,
        board: encodeBoard(bs.game.board),
        pending: pendingGarbageLines(bs),
      });
    },
    [pushLock],
  );

  /** 이 기기가 모르는 매치의 자리를 기권한다(D-020) — 판이 없으니 한 번만 보낸다 */
  const forfeit = useCallback((matchId: string) => {
    const s = socketRef.current;
    if (s?.connected) s.timeout(ACK_TIMEOUT_MS).emit(TetrisBattleClientEvents.TOP_OUT, { matchId, frame: 0 }, () => {});
  }, []);

  const play = useBattlePlay({
    onLock: (lock, bs) => queueLock(bs, lock.sent, lock.perfectClear),
    onOver: (bs) => {
      const matchId = playingMatchIdRef.current;
      if (!matchId) return;
      setPhase({ kind: "out", matchId, place: null });
      setTopOut({ matchId, frame: bs.game.endFrame });
    },
  });
  const { start: startPlay, stop: stopPlay, receive, battleRef, buildReplay } = play;

  const clearResultWait = () => {
    if (resultWaitTimerRef.current) {
      clearTimeout(resultWaitTimerRef.current);
      resultWaitTimerRef.current = null;
    }
  };

  const clearStartTimer = () => {
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }
  };

  /**
   * 모아 둔 가비지를 중복 없이 판에 넘긴다 — 판이 이 매치로 진행 중이고 재입장을 기다리지 않을 때만
   * 한 번에 넘긴 것은 같은 틱에 들어가고, useBattlePlay가 틱마다 id 오름차순으로 정렬해 넣는다
   */
  const flushGarbage = useCallback(() => {
    if (rejoiningRef.current || !matchIdRef.current || playingMatchIdRef.current !== matchIdRef.current) return;
    const held = heldGarbageRef.current;
    if (held.length === 0) return;
    heldGarbageRef.current = [];
    const seen = new Set<number>();
    for (const g of held) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      receive(g);
    }
  }, [receive]);

  /** 판을 멈추고 결과 화면으로 — 결과 데이터가 없으면(끊긴 사이 종료) 빈 결과 */
  const endMatch = useCallback(
    (matchId: string | null, results: MatchResultEntry[]) => {
      clearStartTimer();
      clearResultWait();
      stopPlay();
      heldGarbageRef.current = [];
      setPhase({ kind: "ended", matchId, results });
      // 이 기기에 그 매치의 판이 있을 때만 제출한다 — 새로고침 기권(D-020)·관전만 한 경우는 판이 없다
      // 생존자는 판을 멈춘 지금 프레임까지(stop 뒤 buildReplay)가 리플레이 길이다
      const submit = submitReplayRef.current;
      if (!submit || !matchId || playingMatchIdRef.current !== matchId || submittedRef.current.has(matchId) || serverKoRef.current.has(matchId)) {
        return;
      }
      const replay = buildReplay();
      if (!replay) return;
      submittedRef.current.add(matchId);
      setReplaySubmit({ matchId, status: "submitting" });
      void submit(matchId, replay).then((status) => {
        setReplaySubmit((prev) => (prev?.matchId === matchId ? { matchId, status } : prev));
      });
    },
    [stopPlay, setPhase, buildReplay],
  );

  // ===== 서버 이벤트 =====

  useEffect(() => {
    if (!socket) return;
    // 경기 중 소켓이 새로 만들어졌다(로그인 상태 변화) — 이전 소켓의 disconnect는 리스너가 먼저 지워져 오지 않으므로 여기서 재입장 대기로 둔다
    // (같은 소켓으로 effect만 다시 도는 경우는 제외 — 그때 대기로 두면 가비지가 계속 보류된다)
    if (prevSocketRef.current && prevSocketRef.current !== socket && matchIdRef.current) rejoiningRef.current = true;
    prevSocketRef.current = socket;
    const isCurrent = (matchId: string) => matchIdRef.current === matchId;

    const onStarting = (p: { matchId: string; seed: number; startInMs: number; players: { playerId: string; name: string }[] }) => {
      clearStartTimer();
      clearResultWait();
      stopPlay();
      matchIdRef.current = p.matchId;
      playingMatchIdRef.current = null;
      heldGarbageRef.current = [];
      resetOutbox();
      setTargetId(null);
      setMyKos(0);
      setOpponents(
        p.players
          .filter((pl) => pl.playerId !== myIdRef.current)
          .map((pl) => ({ playerId: pl.playerId, name: pl.name, cells: null, pending: 0, place: null, kos: 0 })),
      );
      // 기기 시계 대신 수신 시각 + startInMs (DESIGN §16)
      const delay = Math.max(0, p.startInMs);
      setPhase({ kind: "countdown", matchId: p.matchId, startsAt: performance.now() + delay });
      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null;
        if (!isCurrent(p.matchId)) return;
        startPlay(p.seed, das, arr);
        playingMatchIdRef.current = p.matchId;
        setPhase({ kind: "playing", matchId: p.matchId });
        getSoundPlayer().play({ kind: "go" });
        flushGarbage(); // 시작 전에 온 가비지(상대가 먼저 시작한 경우)
      }, delay);
    };

    const onGarbage = (p: GarbagePayload) => {
      if (!isCurrent(p.matchId)) return;
      heldGarbageRef.current.push({ id: p.id, lines: p.lines, hole: p.hole });
      flushGarbage();
    };

    const onAttackEvent = (p: { matchId: string; from: string; to: string; lines: number }) => {
      if (!isCurrent(p.matchId)) return;
      onAttackRef.current?.(p.from, p.to, p.lines);
      // 내가 보낸 공격 — 송신음 (받는 쪽 경고음은 가비지가 판에 들어올 때 useBattlePlay가 낸다)
      if (p.from === myIdRef.current) getSoundPlayer().play({ kind: "attack", value: p.lines });
    };

    const onOpponent = (p: { matchId: string; playerId: string; board: string; pending: number }) => {
      if (!isCurrent(p.matchId)) return;
      const cells = decodeBoard(p.board);
      setOpponents((prev) =>
        prev.map((o) => (o.playerId === p.playerId ? { ...o, cells: cells ?? o.cells, pending: p.pending } : o)),
      );
    };

    const onKo = (p: { matchId: string; playerId: string; by: string | null; place: number; reason: string }) => {
      if (!isCurrent(p.matchId)) return;
      if (p.by && p.by === myIdRef.current) setMyKos((k) => k + 1);
      // 상대 탈락 폭발음 — 내 탈락은 내 판의 게임 오버 신호가 낸다
      if (p.playerId !== myIdRef.current) getSoundPlayer().play({ kind: "ko" });
      setOpponents((prev) =>
        prev.map((o) => {
          if (o.playerId === p.playerId) return { ...o, place: p.place };
          if (o.playerId === p.by) return { ...o, kos: o.kos + 1 };
          return o;
        }),
      );
      if (p.playerId === myIdRef.current) {
        // 끊김 유예 초과·기권 등 서버가 먼저 탈락시킨 경우 내 판도 멈춘다
        // 리플레이는 내 topOut으로 탈락했을 때(reason topout + 내 판이 끝남)만 낸다 — 끊김 KO는 서버 탈락 frame이 내 판과 달라 INVALID가 된다
        const selfTopOut = p.reason === "topout" && playingMatchIdRef.current === p.matchId && battleRef.current?.game.over;
        if (selfTopOut) selfTopOutRef.current.add(p.matchId);
        else {
          serverKoRef.current.add(p.matchId);
          // 서버가 정한 탈락(끊김·나감)은 내 판의 게임 오버 신호가 없다 — 여기서 낸다
          getSoundPlayer().play({ kind: "gameOver" });
        }
        clearStartTimer();
        stopPlay();
        setPhase({ kind: "out", matchId: p.matchId, place: p.place });
      }
    };

    const onEnded = (p: { matchId: string; results: MatchResultEntry[] }) => {
      if (!isCurrent(p.matchId)) return;
      // 마지막 상대의 KO 폭발음과 겹치지 않게 조금 뒤에
      if (p.results.find((r) => r.playerId === myIdRef.current)?.place === 1) {
        winSoundTimerRef.current = setTimeout(() => {
          winSoundTimerRef.current = null;
          getSoundPlayer().play({ kind: "win" });
        }, WIN_SOUND_DELAY_MS);
      }
      endMatch(p.matchId, p.results);
    };

    // 끊기면 재입장 응답까지 가비지를 모으고 요청을 멈춘다
    const onDisconnect = () => {
      if (matchIdRef.current) rejoiningRef.current = true;
    };

    socket.on(TetrisBattleServerEvents.MATCH_STARTING, onStarting);
    socket.on(TetrisBattleServerEvents.GARBAGE, onGarbage);
    socket.on(TetrisBattleServerEvents.ATTACK, onAttackEvent);
    socket.on(TetrisBattleServerEvents.OPPONENT_UPDATE, onOpponent);
    socket.on(TetrisBattleServerEvents.PLAYER_KO, onKo);
    socket.on(TetrisBattleServerEvents.MATCH_ENDED, onEnded);
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off(TetrisBattleServerEvents.MATCH_STARTING, onStarting);
      socket.off(TetrisBattleServerEvents.GARBAGE, onGarbage);
      socket.off(TetrisBattleServerEvents.ATTACK, onAttackEvent);
      socket.off(TetrisBattleServerEvents.OPPONENT_UPDATE, onOpponent);
      socket.off(TetrisBattleServerEvents.PLAYER_KO, onKo);
      socket.off(TetrisBattleServerEvents.MATCH_ENDED, onEnded);
      socket.off("disconnect", onDisconnect);
    };
  }, [socket, das, arr, startPlay, stopPlay, flushGarbage, endMatch, setPhase, battleRef, resetOutbox]);

  // 언마운트 — 타이머 정리
  useEffect(
    () => () => {
      clearStartTimer();
      if (winSoundTimerRef.current) clearTimeout(winSoundTimerRef.current);
      if (resultWaitTimerRef.current) clearTimeout(resultWaitTimerRef.current);
    },
    [],
  );

  // ===== 재연결 복구 =====

  useEffect(
    () =>
      registerMatchSync({
        lastGarbageId: () => {
          if (!matchIdRef.current) return null;
          // 이 매치의 판이 아직 없으면(카운트다운) 처음부터
          if (playingMatchIdRef.current !== matchIdRef.current) return 0;
          const received = battleRef.current?.received ?? [];
          return received.length > 0 ? received[received.length - 1].id : 0;
        },
        onRejoin: (rejoin: RejoinData | undefined) => {
          rejoiningRef.current = false;
          if (!rejoin) {
            flushGarbage();
            flushOutbox();
            return;
          }
          const { match } = rejoin;
          if (match.matchId !== matchIdRef.current) {
            // 이 기기는 이 매치를 모른다(새로고침·matchStarting 유실) — 살아 있는 자리면 기권해 경기가 멈추지 않게 한다(D-020)
            heldGarbageRef.current = [];
            if (match.status === "PLAYING") {
              if (match.alive) forfeit(match.matchId);
              clearStartTimer();
              stopPlay();
              setPhase({ kind: "unavailable", forfeited: match.alive });
            }
            return;
          }
          if (match.status === "ENDED") {
            // 결과를 이미 받았으면(결과 화면에서 잠깐 끊김) 그대로 둔다
            const current = phaseRef.current;
            if (!(current.kind === "ended" && current.matchId === match.matchId)) endMatch(match.matchId, []);
            return;
          }
          if (!match.alive) {
            // 끊긴 사이 서버가 탈락시켰다 — 내 판이 끝났어도(topOut이 서버에 닿지 못함) 서버 탈락 frame과 달라 제출하지 않는다
            // 단 이미 내 topOut으로 탈락이 확정된 매치(관전 중 끊김)는 그대로 제출한다
            if (!selfTopOutRef.current.has(match.matchId)) serverKoRef.current.add(match.matchId);
            clearStartTimer();
            stopPlay();
            heldGarbageRef.current = [];
            const current = phaseRef.current;
            if (current.kind === "playing" || current.kind === "countdown") setPhase({ kind: "out", matchId: match.matchId, place: null });
            return;
          }
          // 놓친 가비지 + 그사이 받은 실시간 가비지를 합쳐 id 순으로 (카운트다운 중이면 시작할 때 넣는다)
          for (const g of rejoin.missedGarbage) heldGarbageRef.current.push({ id: g.id, lines: g.lines, hole: g.hole });
          flushGarbage();
          setOpponents((prev) =>
            prev.map((o) => {
              const snapshot = rejoin.opponents.find((r) => r.playerId === o.playerId);
              if (!snapshot) return o;
              const cells = decodeBoard(snapshot.board);
              // 끊긴 사이 탈락했으면 순위를 몰라도 탈락으로 그린다(순위는 서버가 뒤이어 보내는 playerKO가 채운다)
              const out = o.out || (!snapshot.alive && o.place === null);
              return { ...o, cells: cells ?? o.cells, pending: snapshot.pending, ...(out ? { out } : {}) };
            }),
          );
          // 대상이 끊긴 사이 탈락했으면 다음 lock 응답이 새 대상을 정할 때까지 비운다
          setTargetId((prev) => (prev && rejoin.opponents.some((r) => r.playerId === prev && !r.alive) ? null : prev));
          // 끊긴 동안 확인받지 못한 lock·topOut을 보낸 그대로 다시 보낸다
          flushOutbox();
        },
      }),
    [registerMatchSync, battleRef, flushGarbage, flushOutbox, forfeit, stopPlay, setPhase, endMatch],
  );

  // ===== 방 상태와 맞추기 =====

  useEffect(() => {
    const current = phaseRef.current;
    if (room.status === "WAITING" && current.kind !== "idle" && current.kind !== "countdown") {
      // 재대결 — 대기실로
      clearStartTimer();
      clearResultWait();
      stopPlay();
      matchIdRef.current = null;
      playingMatchIdRef.current = null;
      heldGarbageRef.current = [];
      resetOutbox();
      setOpponents([]);
      setTargetId(null);
      setPhase({ kind: "idle" });
    } else if (room.status === "PLAYING" && current.kind === "idle") {
      // 경기 중에 들어왔다(새로고침 등) — 이 기기에는 판이 없어 참여할 수 없다
      setPhase({ kind: "unavailable", forfeited: false });
    } else if (room.status === "RESULT" && (current.kind === "countdown" || current.kind === "playing" || current.kind === "out")) {
      // 경기가 끝났다 — 판은 바로 멈추고(카운트다운이면 시작하지 않는다), 결과는 matchEnded를 잠깐 기다린다
      // (서버 경로에 따라 roomState가 matchEnded보다 먼저 온다). 끝내 안 오면(끊긴 사이 종료) 결과 없는 종료 화면으로
      clearStartTimer();
      stopPlay();
      const matchId = matchIdRef.current;
      if (!resultWaitTimerRef.current) {
        resultWaitTimerRef.current = setTimeout(() => {
          resultWaitTimerRef.current = null;
          const now = phaseRef.current;
          // 그사이 다음 매치로 넘어갔으면(재대결) 건드리지 않는다
          if (matchIdRef.current !== matchId) return;
          if (now.kind === "countdown" || now.kind === "playing" || now.kind === "out") endMatch(matchId, []);
        }, RESULT_WAIT_MS);
      }
    } else if (room.status !== "PLAYING" && current.kind === "unavailable") {
      setPhase({ kind: "idle" });
    }
  }, [room.status, stopPlay, setPhase, endMatch, resetOutbox]);

  return { phase, opponents, targetId, myKos, replaySubmit, play };
}
