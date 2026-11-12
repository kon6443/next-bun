"use client";

import { WaitingRoomView } from "@/app/games/_shared/battle-room/components/WaitingRoomView";
import type { RoomState } from "@/types/tetrisBattleSocket";
import { type ConnectionStatus, useBattleSocket } from "../contexts/BattleSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { BATTLE_CONTROL_GUIDE } from "../../lib/controls";

type WaitingRoomProps = {
  room: RoomState;
  connection: ConnectionStatus;
  onReconnect: () => void;
  onExit: () => void;
  onCopyInvite: () => void;
};

/**
 * 테트리스 대전 대기실 — 공용 대기실(WaitingRoomView)에 테트리스 소켓·안내(▲ 범례·키보드 조작)를 잇는다
 */
export function WaitingRoom({ room, connection, onReconnect, onExit, onCopyInvite }: WaitingRoomProps) {
  const api = useBattleSocket();
  return (
    <WaitingRoomView
      room={room}
      connection={connection}
      onReconnect={onReconnect}
      onExit={onExit}
      onCopyInvite={onCopyInvite}
      api={api}
      errorMessage={battleErrorMessage}
      notes={
        <>
          {/* 경기 화면의 ▲ 범례 — 상대 판 이름 앞 표시의 뜻을 시작 전에 (UX 점검) */}
          <p className="mt-3 text-xs text-slate-400" data-testid="battle-target-legend">
            <span className="text-rose-300" aria-hidden="true">
              ▲
            </span>{" "}
            경기 중 상대 이름 앞 ▲는 내가 줄을 지우면 방해 줄이 가는 상대예요.
          </p>
          {/* 키보드 조작 — 데스크톱 대전에서 볼 곳이 없었다. 터치 기기는 버튼이라 숨긴다 (games-polish FE-32) */}
          <details className="mt-3 text-xs text-slate-400 [@media(pointer:coarse)]:hidden">
            <summary className="flex min-h-11 cursor-pointer items-center">키보드 조작</summary>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" aria-label="대전 키보드 조작">
              {BATTLE_CONTROL_GUIDE.map(({ keys, label }) => (
                <div key={keys} className="contents">
                  <dt className="font-mono font-semibold text-sky-300">{keys}</dt>
                  <dd>{label}</dd>
                </div>
              ))}
            </dl>
          </details>
        </>
      }
    />
  );
}
