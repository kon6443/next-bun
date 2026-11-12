'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  type BattleRoomCoreConfig,
  type BattleResult as CoreBattleResult,
  useBattleRoomCore,
} from '@/app/games/_shared/battle-room/contexts/useBattleRoomCore';
import {
  type CreateRoomPayload,
  type EnterRoomAckData,
  type JoinRoomPayload,
  type RejoinData,
  type RoomState,
  type RoomSummary,
  TETRIS_BATTLE_NAMESPACE,
  type TetrisBattleErrorCode,
  type TetrisBattleSocket,
  type TetrisBattleEmoteId,
} from '@/types/tetrisBattleSocket';
import { battleErrorMessage } from '../lib/battleErrors';
import { clearRoomSession, loadRoomSession, resetRoomSessionForTest, saveRoomSession } from '../lib/roomSession';

export {
  LEAVE_RETRY_DELAYS_MS,
  SEAT_IN_USE_RETRY_MS,
  SEAT_IN_USE_WAIT_MS,
  SERVER_RECONNECT_MIN_GAP_MS,
  useEnterScope,
  type ConnectionStatus,
  type EnterScope,
  type JoinOptions,
  type ReceivedChat,
  type ReceivedEmote,
  type RoomNotice,
} from '@/app/games/_shared/battle-room/contexts/useBattleRoomCore';
import type {
  ConnectionStatus,
  EnterScope,
  JoinOptions,
  ReceivedChat,
  ReceivedEmote,
  RoomNotice,
} from '@/app/games/_shared/battle-room/contexts/useBattleRoomCore';

export type BattleResult<T> = CoreBattleResult<T, TetrisBattleErrorCode>;

/** 진행 중인 매치와 재연결을 잇는다 — 대전 화면(useBattleMatch)이 등록한다 */
export type MatchSync = {
  /** 마지막으로 받아들인 가비지 id — 재연결 joinRoom에 실어 놓친 것만 받는다 */
  lastGarbageId: () => number | null;
  /** 재연결 joinRoom 응답의 복구 데이터 */
  onRejoin: (rejoin: RejoinData | undefined) => void;
};

type BattleSocketContextValue = {
  socket: TetrisBattleSocket | null;
  status: ConnectionStatus;
  /** 로비 방 목록 — 로비 구독 전이면 null */
  rooms: RoomSummary[] | null;
  /** 들어가 있는 방 */
  room: RoomState | null;
  myPlayerId: string | null;
  chat: ReceivedChat[];
  /** 플레이어별 마지막 이모트 */
  emotes: Record<string, ReceivedEmote>;
  /** 재연결 복귀에 실패해 방에서 빠졌을 때의 안내 — 다시 들어가면 지워진다 */
  roomNotice: RoomNotice | null;
  /** 그 방의 안내를 지운다 — 방 화면을 떠날 때 */
  clearRoomNotice: (code: string) => void;
  reconnect: () => void;
  listRooms: () => Promise<BattleResult<RoomSummary[]>>;
  createRoom: (payload: CreateRoomPayload, scope?: EnterScope) => Promise<BattleResult<EnterRoomAckData>>;
  /** 기다리는 동안(retrySeatInUse)도 입장 중으로 친다 */
  joinRoom: (payload: JoinRoomPayload, scope?: EnterScope, options?: JoinOptions) => Promise<BattleResult<EnterRoomAckData>>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<BattleResult<unknown>>;
  /** 방장 — 매치 시작 */
  startMatch: () => Promise<BattleResult<unknown>>;
  /** 방장 — 결과 화면에서 같은 방으로 재대결(대기실로) */
  rematch: () => Promise<BattleResult<unknown>>;
  /** 매치 화면이 재연결 복구를 받으려고 등록한다 — 해제 함수를 돌려준다 */
  registerMatchSync: (sync: MatchSync) => () => void;
  /** 이 탭이 그 방에 들어갈 때 받은 playerToken — 리플레이 제출용. 저장소 값은 다른 탭이 바꿀 수 있어 이 탭 메모리 값을 쓴다 */
  playerTokenFor: (code: string) => string | null;
  /**
   * 방 안 요청이 NOT_IN_ROOM을 받았다 — 서버가 이 소켓을 자리에서 뗐다(반쯤 열린 연결 판정 뒤 등). 토큰으로 한 번 복귀를 시도한다
   * 결과는 대전 화면의 onRejoin(성공)·방 밖으로(실패)로 알린다. 이미 복귀 중이면 아무것도 하지 않는다
   */
  recoverSeat: () => void;
  /** 방장 — 대기·결과 단계에서 다른 참가자를 내보낸다 */
  kickPlayer: (playerId: string) => Promise<BattleResult<unknown>>;
  sendChat: (text: string) => Promise<BattleResult<unknown>>;
  sendEmote: (emoteId: TetrisBattleEmoteId) => Promise<BattleResult<unknown>>;
};

const BattleSocketContext = createContext<BattleSocketContextValue | null>(null);

/** 테트리스 대전 설정 — 저장 키·namespace는 이전 배포와 바이트 그대로 */
const TETRIS_ROOM_CONFIG: BattleRoomCoreConfig = {
  namespace: TETRIS_BATTLE_NAMESPACE,
  sessions: { loadRoomSession, saveRoomSession, clearRoomSession, resetRoomSessionForTest },
  errorMessage: battleErrorMessage,
};

/**
 * 테트리스 대전 소켓 — 로비·방 화면이 함께 쓴다(대전 경로 layout에 둬서 로비 → 방 이동 중 연결이 유지된다)
 * 연결·입장·복귀·채팅·이모트는 대전 방 공용 코어(useBattleRoomCore)가 맡고, 여기서는 테트리스 타입과 재연결 가비지 id만 잇는다
 */
export function BattleSocketProvider({ children }: { children: ReactNode }) {
  const core = useBattleRoomCore<RoomState, RoomSummary, CreateRoomPayload, JoinRoomPayload, RejoinData, TetrisBattleErrorCode>(TETRIS_ROOM_CONFIG);
  const coreRegister = core.registerMatchSync;

  /** 재연결 joinRoom에 마지막 가비지 id를 싣는다(있을 때만) */
  const registerMatchSync = useCallback(
    (sync: MatchSync) =>
      coreRegister({
        rejoinExtra: () => {
          const lastGarbageId = sync.lastGarbageId();
          return lastGarbageId !== null ? { lastGarbageId } : {};
        },
        onRejoin: sync.onRejoin,
      }),
    [coreRegister],
  );

  const value = useMemo<BattleSocketContextValue>(
    () => ({
      socket: core.socket as TetrisBattleSocket | null,
      status: core.status,
      rooms: core.rooms,
      room: core.room,
      myPlayerId: core.myPlayerId,
      chat: core.chat,
      emotes: core.emotes,
      roomNotice: core.roomNotice,
      clearRoomNotice: core.clearRoomNotice,
      reconnect: core.reconnect,
      listRooms: core.listRooms,
      createRoom: core.createRoom,
      joinRoom: core.joinRoom,
      leaveRoom: core.leaveRoom,
      setReady: core.setReady,
      startMatch: core.startMatch,
      rematch: core.rematch,
      registerMatchSync,
      playerTokenFor: core.playerTokenFor,
      recoverSeat: core.recoverSeat,
      kickPlayer: core.kickPlayer,
      sendChat: core.sendChat,
      sendEmote: core.sendEmote,
    }),
    [core, registerMatchSync],
  );

  return <BattleSocketContext.Provider value={value}>{children}</BattleSocketContext.Provider>;
}

export function useBattleSocket(): BattleSocketContextValue {
  const value = useContext(BattleSocketContext);
  if (!value) throw new Error('useBattleSocket은 BattleSocketProvider 안에서만 쓸 수 있습니다');
  return value;
}
