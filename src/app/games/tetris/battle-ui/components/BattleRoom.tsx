"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, LoadingSpinnerSimple } from "@/app/teams/components";
import { baseInputStyles } from "@/app/teams/components/FormInput";
import { ROOM_PASSWORD_MAX_LENGTH, TetrisBattleErrorCodes } from "@/types/tetrisBattleSocket";
import { PLAYER_NAME_MAX_LENGTH } from "@/app/games/_shared/lib/playerName";
import { useBattleSocket, useEnterScope } from "../contexts/BattleSocketContext";
import { usePlayerName } from "../hooks/usePlayerName";
import { battleErrorMessage } from "../lib/battleErrors";
import { loadRoomSession } from "../lib/roomSession";
import { ConnectionBadge } from "./ConnectionBadge";
import { RoomStage } from "./RoomStage";

const LOBBY_PATH = "/games/tetris/battle";

type JoinState =
  | { status: "auto" }
  | { status: "form"; needPassword: boolean }
  | { status: "joining" };

/**
 * 방 화면 — 들어가 있지 않으면 입장(저장된 재연결 정보가 있으면 자동, 없으면 이름·비밀번호 입력), 들어가 있으면 대기실·대전
 */
export function BattleRoom({ code, lockedHint }: { code: string; lockedHint: boolean }) {
  const router = useRouter();
  const { status, room, roomNotice, joinRoom, leaveRoom, reconnect } = useBattleSocket();
  const player = usePlayerName();
  const [join, setJoin] = useState<JoinState>(() => ({ status: "auto" }));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 나가는 중 — 로비로 이동이 끝날 때까지 입장 폼을 그리지 않는다(이동은 transition이라 방 상태 초기화가 먼저 그려진다) */
  const [leaving, setLeaving] = useState(false);
  const inRoom = room?.code === code;

  // 이 화면을 떠나면 아직 응답이 안 온 입장은 버린다(늦게 성공하면 컨텍스트가 바로 나간다)
  const enterScope = useEnterScope();

  // 저장된 재연결 정보로 한 번 자동 입장 (새로고침·직접 링크)
  const autoTriedRef = useRef(false);
  // 들어가 있다가 빠지면(재연결 복귀 실패) 자동 입장을 다시 시도할 수 있게 되돌린다 — 저장값이 없으면 입력 폼으로
  useEffect(() => {
    if (!inRoom) return;
    autoTriedRef.current = false;
    setJoin({ status: "auto" });
    setError(null);
  }, [inRoom]);
  useEffect(() => {
    if (inRoom || status !== "connected" || autoTriedRef.current) return;
    autoTriedRef.current = true;
    const saved = loadRoomSession(code);
    if (!saved) {
      setJoin({ status: "form", needPassword: lockedHint });
      return;
    }
    setJoin({ status: "joining" });
    joinRoom({ code, playerName: saved.playerName, playerToken: saved.playerToken }, enterScope).then((result) => {
      if (result.ok) return;
      setJoin({ status: "form", needPassword: lockedHint });
      if (result.code !== TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN) setError(battleErrorMessage(result.code));
    });
  }, [inRoom, status, code, joinRoom, lockedHint, enterScope]);

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = player.resolve();
    if (resolved.error !== null) return setError(resolved.error);
    setError(null);
    setJoin({ status: "joining" });
    const result = await joinRoom(
      { code, playerName: resolved.name, password: password.length > 0 ? password : undefined },
      enterScope,
    );
    if (result.ok) {
      player.remember(resolved.name);
      return;
    }
    const needPassword =
      result.code === TetrisBattleErrorCodes.ROOM_WRONG_PASSWORD || (join.status === "form" && join.needPassword);
    setJoin({ status: "form", needPassword });
    // 비밀번호를 아직 안 보여 줬는데 틀렸다고 오면 "필요하다"로 안내한다
    setError(
      result.code === TetrisBattleErrorCodes.ROOM_WRONG_PASSWORD && password.length === 0
        ? "비밀번호가 있는 방이에요. 비밀번호를 입력해 주세요."
        : battleErrorMessage(result.code),
    );
  };

  /** 먼저 이동한다 — 나가기 응답(최대 몇 초)을 기다리는 동안 입장 화면이 보이지 않게 */
  const exit = () => {
    setLeaving(true);
    router.push(LOBBY_PATH);
    void leaveRoom();
  };

  const copyInvite = async () => {
    const url = `${window.location.origin}${LOBBY_PATH}/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("초대 링크를 복사했어요.");
    } catch {
      toast.error(`복사하지 못했어요. 코드 ${code}를 알려 주세요.`);
    }
  };

  if (leaving) return null;

  if (inRoom && room) {
    return <RoomStage room={room} connection={status} onReconnect={reconnect} onExit={exit} onCopyInvite={copyInvite} />;
  }

  return (
    <div className="h-full overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3">
          <Link
            href={LOBBY_PATH}
            className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
          >
            ← 방 목록
          </Link>
          <ConnectionBadge status={status} onReconnect={reconnect} />
        </header>

        <section className="rounded-3xl border border-slate-700/50 bg-slate-800/50 p-5">
          <p className="text-xs font-semibold tracking-[0.3em] text-slate-400">ROOM</p>
          <h1 className="mt-1 font-mono text-3xl font-bold tracking-[0.2em] text-white">{code}</h1>

          {roomNotice?.code === code && (
            <p role="status" className="mt-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              {roomNotice.message}
            </p>
          )}
          {join.status !== "form" ? (
            <div className="mt-6 flex justify-center" role="status" aria-label="입장하는 중">
              <LoadingSpinnerSimple />
            </div>
          ) : (
            <form onSubmit={submitJoin} className="mt-4">
              <label htmlFor="battle-join-name" className="block text-sm font-semibold text-slate-300">
                내 이름
              </label>
              <input
                id="battle-join-name"
                value={player.name}
                onChange={(e) => player.change(e.target.value)}
                maxLength={PLAYER_NAME_MAX_LENGTH * 2}
                autoComplete="nickname"
                className={`${baseInputStyles} mt-2 min-h-11 px-4 py-2`}
              />
              {join.needPassword && (
                <>
                  <label htmlFor="battle-join-password" className="mt-3 block text-sm font-semibold text-slate-300">
                    비밀번호
                  </label>
                  <input
                    id="battle-join-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    maxLength={ROOM_PASSWORD_MAX_LENGTH}
                    autoComplete="off"
                    className={`${baseInputStyles} mt-2 min-h-11 px-4 py-2`}
                  />
                </>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-300">
                  {error}
                </p>
              )}
              <Button type="submit" size="md" fullWidth className="mt-4 min-h-11" disabled={status !== "connected"}>
                입장
              </Button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
