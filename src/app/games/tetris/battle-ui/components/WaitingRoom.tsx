"use client";

import { useState } from "react";
import { ConfirmModal } from "@/app/components/ConfirmModal";
import { Button } from "@/app/teams/components";
import { ROOM_MIN_PLAYERS, type RoomState } from "@/types/tetrisBattleSocket";
import { type ConnectionStatus, useBattleSocket } from "../contexts/BattleSocketContext";
import { battleErrorMessage } from "../lib/battleErrors";
import { ChatPanel } from "./ChatPanel";
import { ConnectionBadge } from "./ConnectionBadge";
import { BATTLE_CONTROL_GUIDE } from "../../lib/controls";
import { EmoteBar } from "./EmoteBar";
import { EmoteBubble } from "./EmoteBubble";
import { PresenceDot } from "./PresenceDot";
import { useOfflineCountdown } from "../hooks/useOfflineCountdown";

type WaitingRoomProps = {
  room: RoomState;
  connection: ConnectionStatus;
  onReconnect: () => void;
  onExit: () => void;
  onCopyInvite: () => void;
};

/**
 * 대기실 — 플레이어·준비·방장 시작·초대·채팅·이모트
 */
export function WaitingRoom({ room, connection, onReconnect, onExit, onCopyInvite }: WaitingRoomProps) {
  const { myPlayerId, chat, emotes, setReady, startMatch, sendChat, sendEmote, kickPlayer } = useBattleSocket();
  const [error, setError] = useState<string | null>(null);
  /** 내보내기 확인 중인 참가자 */
  const [kickTarget, setKickTarget] = useState<{ playerId: string; name: string } | null>(null);
  const [kicking, setKicking] = useState(false);
  const [pendingReady, setPendingReady] = useState(false);
  const [starting, setStarting] = useState(false);

  const me = room.players.find((p) => p.playerId === myPlayerId) ?? null;
  const isHost = room.hostId === myPlayerId;
  // 방장이 끊기면 서버가 유예(10초) 뒤 연결된 사람에게 넘긴다(D-009) — 그동안 시작을 기다리는 사람에게 알린다
  const hostDisconnected = !isHost && room.players.some((p) => p.playerId === room.hostId && !p.connected);
  // 대기·결과 단계의 오프라인 자리는 유예 뒤 정리된다 — 남은 초 (경기 중에는 빼지 않는다)
  const offlineLeft = useOfflineCountdown(room.players, room.status !== "PLAYING");
  const canKick = isHost && room.status !== "PLAYING";

  const confirmKick = async () => {
    if (!kickTarget) return;
    setKicking(true);
    const result = await kickPlayer(kickTarget.playerId);
    setKicking(false);
    setKickTarget(null);
    setError(result.ok ? null : battleErrorMessage(result.code));
  };
  // 서버 시작 조건(D-019)과 같다: 2명 이상, 방장 포함 전원 연결, 방장 외 전원 준비
  const everyoneReady =
    room.players.length >= ROOM_MIN_PLAYERS && room.players.every((p) => p.connected && (p.ready || p.playerId === room.hostId));

  const start = async () => {
    setStarting(true);
    const result = await startMatch();
    // 성공이면 잠근 채 둔다 — matchStarting은 ack보다 먼저 와 곧 대전 화면으로 바뀐다(Q-B1).
    // 풀어 두면 그 틈에 다시 눌러 MATCH_ALREADY_STARTED 문구가 번쩍인다 (games-polish FE-34)
    if (result.ok) return;
    setStarting(false);
    setError(battleErrorMessage(result.code));
  };

  const toggleReady = async () => {
    if (!me) return;
    setPendingReady(true);
    const result = await setReady(!me.ready);
    setPendingReady(false);
    setError(result.ok ? null : battleErrorMessage(result.code));
  };

  return (
    <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={onExit}
          className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
        >
          ← 나가기
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold text-white">
            {room.locked && (
              <span role="img" aria-label="비밀번호 방">
                🔒{" "}
              </span>
            )}
            {room.name}
          </p>
          <p className="font-mono text-xs tracking-[0.2em] text-slate-400">{room.code}</p>
        </div>
        <ConnectionBadge status={connection} onReconnect={onReconnect} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4" style={{ touchAction: "pan-y" }}>
        <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <section className="rounded-3xl border border-slate-700/50 bg-slate-800/50 p-4" aria-labelledby="battle-players">
            <div className="flex items-center justify-between">
              <h2 id="battle-players" className="text-sm font-semibold text-white">
                플레이어 {room.players.length}/{room.maxPlayers}
              </h2>
              <button type="button" onClick={onCopyInvite} className="min-h-11 px-2 text-xs font-semibold text-sky-300">
                초대 링크 복사
              </button>
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {room.players.map((p) => (
                <li
                  key={p.playerId}
                  className={`relative rounded-2xl border px-3 py-3 ${
                    p.playerId === myPlayerId ? "border-sky-400/50 bg-sky-500/10" : "border-slate-700/50 bg-slate-900/60"
                  } ${p.connected ? "" : "opacity-60"}`}
                >
                  <p className="truncate text-sm font-semibold text-white">
                    {p.playerId === room.hostId && (
                      <span role="img" aria-label="방장">
                        👑{" "}
                      </span>
                    )}
                    {p.name}
                    {p.playerId === myPlayerId && <span className="ml-1 text-xs text-sky-300">(나)</span>}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {p.playerId === room.hostId ? "방장" : p.ready ? <span className="text-emerald-300">준비 완료</span> : "대기 중"}
                    {p.isGuest && " · 게스트"}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                    <PresenceDot online={p.connected} />
                    {p.connected ? "온라인" : "오프라인"}
                    {!p.connected && offlineLeft[p.playerId] !== undefined && offlineLeft[p.playerId] > 0 && (
                      <span className="text-slate-500"> · 곧 자리 정리 {offlineLeft[p.playerId]}초</span>
                    )}
                  </p>
                  {canKick && p.playerId !== myPlayerId && (
                    <button
                      type="button"
                      onClick={() => setKickTarget({ playerId: p.playerId, name: p.name })}
                      aria-label={`${p.name} 내보내기`}
                      className="mt-1 min-h-11 text-xs font-semibold text-rose-300 hover:text-rose-200"
                    >
                      내보내기
                    </button>
                  )}
                  <EmoteBubble emote={emotes[p.playerId]} />
                </li>
              ))}
              {Array.from({ length: room.maxPlayers - room.players.length }, (_, i) => (
                <li key={`empty-${i}`} className="rounded-2xl border border-dashed border-slate-700/60 px-3 py-3 text-xs text-slate-500">
                  빈 자리
                </li>
              ))}
            </ul>

            {room.status !== "WAITING" ? (
              <p className="mt-4 text-center text-sm text-slate-300" role="status">
                {room.status === "PLAYING" ? "게임이 진행 중이에요." : "게임이 끝났어요."}
              </p>
            ) : isHost ? (
              <div className="mt-4">
                <Button
                  type="button"
                  size="md"
                  fullWidth
                  className="min-h-11"
                  onClick={start}
                  disabled={!everyoneReady || starting}
                >
                  게임 시작
                </Button>
                <p className="mt-2 text-center text-xs text-slate-500">
                  {everyoneReady ? "모두 준비됐어요." : "2명 이상 모이고 모두 준비(연결)되면 시작할 수 있어요."}
                </p>
              </div>
            ) : (
              <Button
                type="button"
                variant={me?.ready ? "secondary" : "primary"}
                size="md"
                fullWidth
                className="mt-4 min-h-11"
                onClick={toggleReady}
                disabled={!me || pendingReady}
                aria-pressed={me?.ready ?? false}
              >
                {me?.ready ? "준비 취소" : "준비"}
              </Button>
            )}
            {hostDisconnected && room.status === "WAITING" && (
              <p className="mt-2 text-center text-xs text-amber-200" role="status">
                방장이 오프라인이에요. 곧 다른 사람에게 방장이 넘어가요.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-2 text-sm text-rose-300">
                {error}
              </p>
            )}
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
          </section>

          <ChatPanel
            messages={chat}
            myPlayerId={myPlayerId}
            enabled={room.status !== "PLAYING"}
            onSend={async (text) => {
              const result = await sendChat(text);
              return result.ok ? null : battleErrorMessage(result.code);
            }}
          />
        </div>
      </div>

      <EmoteBar
        onSend={async (id) => {
          const result = await sendEmote(id);
          if (!result.ok) setError(battleErrorMessage(result.code));
        }}
      />
      <ConfirmModal
        isOpen={kickTarget !== null}
        onClose={() => setKickTarget(null)}
        onConfirm={confirmKick}
        title="플레이어를 내보낼까요?"
        message={`${kickTarget?.name ?? ""}님을 방에서 내보내요. 다시 들어오면 새로 입장해요.`}
        confirmLabel="내보내기"
        isLoading={kicking}
        variant="danger"
      />
    </div>
  );
}
