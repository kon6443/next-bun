"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, LoadingSpinnerSimple } from "@/app/teams/components";
import { baseInputStyles } from "@/app/teams/components/FormInput";
import {
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  ROOM_PASSWORD_MAX_LENGTH,
  type RoomSummary,
  TetrisBattleErrorCodes,
} from "@/types/tetrisBattleSocket";
import { PLAYER_NAME_MAX_LENGTH } from "@/app/games/_shared/lib/playerName";
import { type ConnectionStatus, useBattleSocket, useEnterScope } from "../contexts/BattleSocketContext";
import { usePlayerName } from "../hooks/usePlayerName";
import { battleErrorMessage } from "../lib/battleErrors";
import { normalizeRoomCode, normalizeRoomName, validateRoomName, validateRoomPassword } from "../lib/roomForm";
import { ConnectionBadge } from "./ConnectionBadge";

const cardStyles = "rounded-3xl border border-slate-700/50 bg-slate-800/50 p-5";
const PLAYER_COUNTS = Array.from({ length: ROOM_MAX_PLAYERS - ROOM_MIN_PLAYERS + 1 }, (_, i) => ROOM_MIN_PLAYERS + i);

/**
 * 연결 직후 목록 받기가 일시 거절이면 잠시 뒤 다시 — 실패하면 로비 구독도 안 돼 목록이 갱신되지 않는다
 * (listRooms 한도 RATE_LIMITED·유저 조회 실패 SERVICE_UNAVAILABLE, BT-02·BT-03, games-polish 새로고침 버튼)
 */
const LIST_RETRYABLE_CODES = new Set<string>([TetrisBattleErrorCodes.RATE_LIMITED, TetrisBattleErrorCodes.SERVICE_UNAVAILABLE, "TIMEOUT"]);
export const LIST_RETRY_MS = 2000;
const LIST_RETRIES = 3;

const roomPath = (code: string, locked = false) => `/games/tetris/battle/${code}${locked ? "?locked=1" : ""}`;

/**
 * 대전 로비 — 이름 · 방 만들기 · 코드로 입장 · 방 목록
 */
export function BattleLobby() {
  const router = useRouter();
  const { status, rooms, room, listRooms, createRoom, leaveRoom, reconnect } = useBattleSocket();
  const player = usePlayerName();

  const [roomName, setRoomName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(ROOM_MAX_PLAYERS);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  /** 새로고침 응답 대기 — 연타로 한도(RATE_LIMITED)에 걸리지 않게 그동안 버튼을 잠근다 */
  const [listing, setListing] = useState(false);

  // 방에서 뒤로 왔으면 방을 나간다 — 로비와 방에 동시에 있지 않게.
  // 진입 시점의 방만 본다(여기서 방을 만들면 이동 전에 room이 생기므로 그 방은 나가면 안 된다)
  const [roomAtEntry] = useState(room);
  useEffect(() => {
    if (!roomAtEntry) return;
    void leaveRoom();
    // 경기 중에 뒤로가기로 나왔으면 기권이다(나가기 버튼은 확인을 받지만 뒤로가기는 막지 않는다 — 메인 결정)
    // id로 한 번만 — 개발 모드 StrictMode에서 effect가 두 번 돌아도 토스트는 하나
    if (roomAtEntry.status === "PLAYING") toast("경기를 나가 이번 판은 기권 처리됐어요.", { id: "battle-forfeit" });
  }, [roomAtEntry, leaveRoom]);

  // 로비를 떠나면 아직 응답이 안 온 방 만들기는 버린다(늦게 성공하면 컨텍스트가 바로 나간다)
  const enterScope = useEnterScope();

  // 연결될 때마다(재연결 포함) 목록을 받고 로비를 구독한다 — 재구독은 여기 한 곳에서만
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (attempt: number) => {
      const result = await listRooms();
      if (cancelled) return;
      setListError(result.ok ? null : battleErrorMessage(result.code));
      if (!result.ok && LIST_RETRYABLE_CODES.has(result.code) && attempt < LIST_RETRIES) {
        timer = setTimeout(() => void load(attempt + 1), LIST_RETRY_MS);
      }
    };
    void load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, listRooms]);

  const refreshList = async () => {
    setListing(true);
    const result = await listRooms();
    setListing(false);
    setListError(result.ok ? null : battleErrorMessage(result.code));
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = player.resolve();
    if (resolved.error !== null) return setError(resolved.error);
    const finalRoomName = roomName.trim() ? roomName : `${resolved.name}의 방`;
    const problem = validateRoomName(finalRoomName) ?? validateRoomPassword(password);
    if (problem) return setError(problem);
    setError(null);
    setCreating(true);
    const result = await createRoom({
      name: normalizeRoomName(finalRoomName),
      maxPlayers,
      password: password.length > 0 ? password : undefined,
      playerName: resolved.name,
    }, enterScope);
    setCreating(false);
    if (!result.ok) return setError(battleErrorMessage(result.code));
    player.remember(resolved.name);
    router.push(roomPath(result.data.room.code));
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) return setError("방 코드 6자리를 확인해 주세요.");
    setError(null);
    router.push(roomPath(normalized));
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3">
          <Link
            href="/games/tetris"
            className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
          >
            ← 테트리스
          </Link>
          <ConnectionBadge status={status} onReconnect={reconnect} />
        </header>

        <section className={cardStyles}>
          <h1 className="text-2xl font-bold text-white">친구와 대전</h1>
          <p className="mt-1 text-sm text-slate-400">2~4명이 같은 블록 순서로 겨뤄요. 줄을 지우면 상대에게 방해 줄이 가요.</p>
          <label htmlFor="battle-player-name" className="mt-4 block text-sm font-semibold text-slate-300">
            내 이름
          </label>
          <input
            id="battle-player-name"
            value={player.name}
            onChange={(e) => player.change(e.target.value)}
            maxLength={PLAYER_NAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            placeholder="대전에서 보일 이름"
            className={`${baseInputStyles} mt-2 min-h-11 px-4 py-2`}
          />
        </section>

        {error && (
          <p role="alert" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        <form onSubmit={submitCreate} className={cardStyles}>
          <h2 className="text-base font-semibold text-white">방 만들기</h2>
          <label htmlFor="battle-room-name" className="mt-3 block text-xs text-slate-400">
            방 이름 (비우면 &ldquo;내 이름의 방&rdquo;)
          </label>
          <input
            id="battle-room-name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={ROOM_NAME_MAX_LENGTH * 2}
            className={`${baseInputStyles} mt-1 min-h-11 px-4 py-2`}
          />
          <fieldset className="mt-3">
            <legend className="text-xs text-slate-400">최대 인원</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {PLAYER_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={maxPlayers === n}
                  onClick={() => setMaxPlayers(n)}
                  className={`min-h-11 rounded-xl border text-sm font-semibold ${
                    maxPlayers === n ? "border-sky-400/70 bg-sky-500/20 text-sky-100" : "border-slate-700/60 bg-slate-900/60 text-slate-300"
                  }`}
                >
                  {n}명
                </button>
              ))}
            </div>
          </fieldset>
          <label htmlFor="battle-room-password" className="mt-3 block text-xs text-slate-400">
            비밀번호 (선택)
          </label>
          <input
            id="battle-room-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={ROOM_PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            className={`${baseInputStyles} mt-1 min-h-11 px-4 py-2`}
          />
          <Button type="submit" size="md" fullWidth className="mt-4 min-h-11" disabled={creating || status !== "connected"}>
            {creating ? "만드는 중..." : "방 만들기"}
          </Button>
        </form>

        <form onSubmit={submitCode} className={cardStyles}>
          <label htmlFor="battle-room-code" className="text-base font-semibold text-white">
            코드로 입장
          </label>
          <div className="mt-3 flex gap-2">
            <input
              id="battle-room-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="ABC234"
              className={`${baseInputStyles} min-h-11 flex-1 px-4 py-2 font-mono tracking-[0.3em]`}
            />
            <Button type="submit" variant="secondary" size="md" className="min-h-11 shrink-0">
              입장
            </Button>
          </div>
        </form>

        <section className={cardStyles} aria-labelledby="battle-room-list">
          <div className="flex items-center justify-between">
            <h2 id="battle-room-list" className="text-base font-semibold text-white">
              방 목록
            </h2>
            <button
              type="button"
              onClick={refreshList}
              disabled={status !== "connected" || listing}
              aria-busy={listing}
              className="min-h-11 px-2 text-xs text-sky-300 disabled:opacity-40"
            >
              새로고침
            </button>
          </div>
          <RoomList rooms={rooms} error={listError} status={status} onReconnect={reconnect} />
        </section>
      </div>
    </div>
  );
}

type RoomListProps = { rooms: RoomSummary[] | null; error: string | null; status: ConnectionStatus; onReconnect: () => void };

function RoomList({ rooms, error, status, onReconnect }: RoomListProps) {
  if (error) return <p className="mt-3 text-sm text-rose-300">{error}</p>;
  // 연결이 없으면 목록이 오지 않는다 — 끝없는 스피너 대신 상태를 알린다 (games-polish FE-33)
  if (rooms === null && status === "failed") {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400" role="status">
        서버에 연결되지 않았어요.
        <button type="button" onClick={onReconnect} className="min-h-11 px-2 text-sm font-semibold text-sky-300 hover:text-sky-200">
          다시 연결
        </button>
      </p>
    );
  }
  if (rooms === null && status === "disconnected") {
    return (
      <p className="mt-3 text-sm text-slate-400" role="status">
        서버에 다시 연결하는 중이에요…
      </p>
    );
  }
  if (rooms === null || status === "connecting") {
    return (
      <div className="mt-4 flex justify-center">
        <LoadingSpinnerSimple />
      </div>
    );
  }
  if (rooms.length === 0) return <p className="mt-3 text-sm text-slate-400">열린 방이 없어요. 방을 만들어 친구를 초대해 보세요.</p>;
  // 대기 중인 방을 먼저
  const sorted = [...rooms].sort((a, b) => Number(a.status !== "WAITING") - Number(b.status !== "WAITING"));
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {sorted.map((r) => {
        const full = r.playerCount >= r.maxPlayers;
        const joinable = r.status === "WAITING" && !full;
        return (
          <li key={r.code} className="flex items-center gap-3 rounded-2xl border border-slate-700/50 bg-slate-900/60 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {r.locked && (
                  <span role="img" aria-label="비밀번호 방">
                    🔒{" "}
                  </span>
                )}
                {r.name}
              </p>
              <p className="text-xs text-slate-400">
                {r.playerCount}/{r.maxPlayers}명 · {r.status === "WAITING" ? "대기 중" : "진행 중"}
              </p>
            </div>
            {joinable ? (
              <Link
                href={roomPath(r.code, r.locked)}
                className="flex min-h-11 items-center rounded-full border border-sky-400/50 px-4 text-xs font-semibold text-sky-200 hover:bg-sky-500/10"
              >
                입장
              </Link>
            ) : (
              <span className="text-xs text-slate-500">{full ? "가득 참" : "진행 중"}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
