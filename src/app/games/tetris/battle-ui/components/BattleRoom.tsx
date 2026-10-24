"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { consumeReloadEntry } from "../lib/pageReload";
import { loadRoomSession } from "../lib/roomSession";
import { ConnectionBadge } from "./ConnectionBadge";
import { RoomStage } from "./RoomStage";

const LOBBY_PATH = "/games/tetris/battle";

type JoinState =
  | { status: "auto" }
  | { status: "form"; needPassword: boolean }
  /** waitingSeat = 다른 탭·기기가 아직 그 자리를 쥐고 있어(SEAT_IN_USE) 잠시 간격으로 다시 묻는 중 */
  | { status: "joining"; waitingSeat?: boolean };

/**
 * 방 화면 — 들어가 있지 않으면 입장(저장된 재연결 정보가 있으면 자동, 없으면 이름·비밀번호 입력), 들어가 있으면 대기실·대전
 */
export function BattleRoom({ code, lockedHint }: { code: string; lockedHint: boolean }) {
  const router = useRouter();
  const { status, room, roomNotice, clearRoomNotice, joinRoom, leaveRoom, reconnect } = useBattleSocket();
  const player = usePlayerName();
  const [join, setJoin] = useState<JoinState>(() => ({ status: "auto" }));
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 나가는 중 — 로비로 이동이 끝날 때까지 입장 폼을 그리지 않는다(이동은 transition이라 방 상태 초기화가 먼저 그려진다) */
  const [leaving, setLeaving] = useState(false);
  const inRoom = room?.code === code;

  // 이 화면을 떠나면 아직 응답이 안 온 입장은 버린다(늦게 성공하면 컨텍스트가 바로 나간다)
  const enterScope = useEnterScope();

  // 다른 탭·기기가 자리를 넘겨받았다 — 자동으로 되찾지 않고 사용자가 고른다
  const replacedHere = roomNotice?.code === code && roomNotice.replaced === true;
  // 방장이 내보냈다 — 안내하고 로비로 (다시 들어오면 새 자리)
  const kickedHere = roomNotice?.code === code && roomNotice.kicked === true;
  useEffect(() => {
    if (!kickedHere) return;
    toast(roomNotice.message, { id: "battle-kicked" });
    router.replace(LOBBY_PATH);
  }, [kickedHere, roomNotice, router]);

  // 방 화면을 떠나면 이 방 안내(넘겨받힘 등)를 지운다 — 나중에 다시 들어오면 자동 입장부터
  useEffect(() => () => clearRoomNotice(code), [code, clearRoomNotice]);

  /**
   * 저장된 재연결 정보로 입장 — 없으면 입력 폼
   * 다른 탭·기기가 경기 중이면(SEAT_IN_USE) 새로고침 직후의 첫 자동 입장(retrySeatInUse)에서만 잠시 간격으로 다시 묻는다(이전 연결이 아직 안 끊김)
   * 새 탭·링크·"이 탭에서 계속하기"·복귀 실패 뒤 다시 자동 입장은 다시 묻지 않는다 — 그쪽이 잠깐 끊긴 틈에 자리를 가져가 진행 중인 판을 기권시키지 않게
   */
  const joinWithSaved = useCallback(async (retrySeatInUse: boolean) => {
    const saved = loadRoomSession(code);
    if (!saved) {
      setJoin({ status: "form", needPassword: lockedHint });
      return;
    }
    setJoin({ status: "joining" });
    const result = await joinRoom({ code, playerName: saved.playerName, playerToken: saved.playerToken }, enterScope, {
      retrySeatInUse,
      onSeatWait: () => setJoin({ status: "joining", waitingSeat: true }),
    });
    if (result.ok || enterScope.cancelled) return;
    setJoin({ status: "form", needPassword: lockedHint });
    if (result.code !== TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN) setError(battleErrorMessage(result.code));
  }, [code, joinRoom, lockedHint, enterScope]);

  // 저장된 재연결 정보로 한 번 자동 입장 (새로고침·직접 링크·새 탭)
  const autoTriedRef = useRef(false);
  // 들어가 있다가 빠지면(재연결 복귀 실패) 자동 입장을 다시 시도할 수 있게 되돌린다 — 저장값이 없으면 입력 폼으로
  useEffect(() => {
    if (!inRoom) return;
    autoTriedRef.current = false;
    setJoin({ status: "auto" });
    setError(null);
  }, [inRoom]);
  useEffect(() => {
    if (inRoom || status !== "connected" || autoTriedRef.current || replacedHere || kickedHere) return;
    autoTriedRef.current = true;
    void joinWithSaved(consumeReloadEntry());
  }, [inRoom, status, replacedHere, kickedHere, joinWithSaved]);

  /** 넘겨받힌 탭에서 "여기서 계속" — 저장된 토큰으로 다시 넘겨받는다 */
  const resumeHere = () => {
    autoTriedRef.current = true;
    setError(null);
    void joinWithSaved(false);
  };

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = player.resolve();
    if (resolved.error !== null) return setError(resolved.error);
    setError(null);
    setJoin({ status: "joining" });
    const base = { code, playerName: resolved.name, password: password.length > 0 ? password : undefined };
    // 이 브라우저에 그 방 자리가 있으면 같은 자리로 들어간다 — 토큰 없이 들어가면 자리가 하나 더 생긴다(FE-01)
    const saved = loadRoomSession(code);
    let result = await joinRoom(saved ? { ...base, playerToken: saved.playerToken } : base, enterScope);
    // 저장된 토큰이 무효였으면(지워졌다) 새로 들어간다
    if (saved && !result.ok && result.code === TetrisBattleErrorCodes.INVALID_PLAYER_TOKEN && !enterScope.cancelled) {
      result = await joinRoom(base, enterScope);
    }
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

  if (leaving || kickedHere) return null;

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
          {replacedHere && join.status === "auto" ? (
            <Button type="button" size="md" fullWidth className="mt-4 min-h-11" onClick={resumeHere} disabled={status !== "connected"}>
              이 탭에서 계속하기
            </Button>
          ) : join.status === "auto" && status === "failed" ? (
            // 자동 입장은 연결된 뒤에만 시작한다 — 연결이 없으면 "입장하는 중" 스피너 대신 상태를 알린다 (games-polish FE-33)
            <p className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-400" role="status">
              서버에 연결되지 않았어요.
              <button type="button" onClick={reconnect} className="min-h-11 px-2 text-sm font-semibold text-sky-300 hover:text-sky-200">
                다시 연결
              </button>
            </p>
          ) : join.status === "auto" && status === "disconnected" ? (
            <p className="mt-6 text-center text-sm text-slate-400" role="status">
              서버에 다시 연결하는 중이에요…
            </p>
          ) : join.status !== "form" ? (
            <div className="mt-6 flex flex-col items-center gap-2" role="status" aria-label="입장하는 중">
              <LoadingSpinnerSimple />
              {join.status === "joining" && join.waitingSeat && (
                <p className="text-center text-sm text-slate-400">이전 연결을 정리하는 중…</p>
              )}
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
