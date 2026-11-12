"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Button, LoadingSpinnerSimple } from "@/app/teams/components";
import { baseInputStyles } from "@/app/teams/components/FormInput";
import { normalizePlayerName, PLAYER_NAME_MAX_LENGTH } from "@/app/games/_shared/lib/playerName";
import type { ConnectionStatus, EnterScope } from "../contexts/useBattleRoomCore";
import { type BaseRoomState, type BaseRoomSummary, ROOM_NAME_MAX_LENGTH, ROOM_PASSWORD_MAX_LENGTH, RoomErrorCodes } from "../lib/roomContract";
import { normalizeRoomCode, normalizeRoomName, validateRoomName, validateRoomPassword } from "../lib/roomForm";
import { pickQuickJoinRoom } from "../lib/pickQuickJoinRoom";
import { ConnectionBadge } from "./ConnectionBadge";

type Failure = { ok: false; code: string };

/** 방 만들기 공통 필드 — 게임별 값은 createPayload로 더한다 */
export type LobbyCreateBase = { name: string; maxPlayers: number; password?: string; playerName: string };
type CreateExtra<CP extends LobbyCreateBase> = Omit<CP, keyof LobbyCreateBase>;

/** 로비가 쓰는 방 소켓 값 — 게임 Provider 값의 부분집합 */
export type BattleLobbyApi<S extends BaseRoomSummary, CP extends LobbyCreateBase = LobbyCreateBase> = {
  status: ConnectionStatus;
  rooms: S[] | null;
  room: BaseRoomState | null;
  listRooms: () => Promise<{ ok: true; data: S[] } | Failure>;
  createRoom: (payload: CP, scope?: EnterScope) => Promise<{ ok: true; data: { room: { code: string } } } | Failure>;
  leaveRoom: () => Promise<void>;
  reconnect: () => void;
};

/** 대전 이름 입력 — 게임별 저장값(usePlayerName) */
export type LobbyPlayerName = {
  name: string;
  change: (value: string) => void;
  resolve: () => { name: string; error: null } | { name: null; error: string };
  remember: (name: string) => void;
};

export type BattleLobbyViewProps<S extends BaseRoomSummary, CP extends LobbyCreateBase = LobbyCreateBase> = {
  api: BattleLobbyApi<S, CP>;
  enterScope: EnterScope;
  player: LobbyPlayerName;
  errorMessage: (code: string) => string;
  /** 방 화면 경로 — 비밀번호 방이면 locked */
  roomPath: (code: string, locked?: boolean) => string;
  back: { href: string; label: string };
  intro: { title: string; description: string };
  /** 고를 수 있는 최대 인원 — 첫 렌더의 마지막 값이 기본 */
  playerCounts: readonly number[];
  /** 방 만들기 — 최대 인원 아래에 넣는 게임별 칸(포트리스 모드·맵) */
  createFields?: ReactNode;
  /** 방 목록 한 줄의 둘째 줄 — 기본 "n/m명 · 대기 중" */
  renderRoomMeta?: (room: S) => ReactNode;
  /**
   * 방 목록 아래 로비 채팅 자리(게임별 패널, tetris-chat) — 게스트는 위 "내 이름" 칸으로 보낸다
   * ctx로 이름 칸 값·검사·오류 표시를 넘긴다(오류는 이름 칸 옆에 보이고 그 칸으로 포커스)
   */
  renderLobbyChat?: (ctx: LobbyChatSlotContext) => ReactNode;
} & (Record<never, never> extends CreateExtra<CP>
  ? { /** 방 만들기 페이로드에 더할 게임별 값 */ createPayload?: CreateExtra<CP> }
  : { /** 방 만들기 페이로드에 더할 게임별 값 — 게임 계약의 필수 필드(포트리스 mode·mapId)라 빠지면 컴파일 오류 */ createPayload: CreateExtra<CP> });

/** 로비 채팅 자리에 넘기는 이름 칸 연결 */
export type LobbyChatSlotContext = {
  /** 이름 칸의 지금 이름(정규화) */
  guestName: string;
  /** 게스트가 보낼 이름 — 문제가 있으면 이름 칸에 오류를 보이고 null */
  resolveGuestName: () => string | null;
  /** 서버가 게스트 이름을 거절했다 — 이름 칸에 보인다 */
  onGuestNameError: (message: string) => void;
};

const cardStyles = "rounded-3xl border border-slate-700/50 bg-slate-800/50 p-5";

/**
 * 연결 직후 목록 받기가 일시 거절이면 잠시 뒤 다시 — 실패하면 로비 구독도 안 돼 목록이 갱신되지 않는다
 * (listRooms 한도 RATE_LIMITED·유저 조회 실패 SERVICE_UNAVAILABLE, BT-02·BT-03, games-polish 새로고침 버튼)
 */
const LIST_RETRYABLE_CODES = new Set<string>([RoomErrorCodes.RATE_LIMITED, RoomErrorCodes.SERVICE_UNAVAILABLE, "TIMEOUT"]);
export const LIST_RETRY_MS = 2000;
const LIST_RETRIES = 3;

/**
 * 대전 로비(공용) — 이름 · 방 목록(빠른 참가) · 로비 채팅(있으면) · 방 만들기 · 코드로 입장 — 들어온 사람이 먼저 열린 방을 보게 (games-polish P7·tetris-chat)
 * 게임별 경로·문구·방 만들기 칸은 props로
 */
export function BattleLobbyView<S extends BaseRoomSummary, CP extends LobbyCreateBase = LobbyCreateBase>({
  api,
  enterScope,
  player,
  errorMessage: battleErrorMessage,
  roomPath: battleRoomPath,
  back,
  intro,
  playerCounts,
  createFields,
  createPayload,
  renderRoomMeta,
  renderLobbyChat,
}: BattleLobbyViewProps<S, CP>) {
  const router = useRouter();
  const { status, rooms, room, listRooms, createRoom, leaveRoom, reconnect } = api;

  const [roomName, setRoomName] = useState("");
  const [pickedMaxPlayers, setMaxPlayers] = useState(playerCounts[playerCounts.length - 1]);
  // 선택지가 바뀌어 고른 값이 없어지면(포트리스 팀전 = 4명 고정) 마지막 값으로
  const maxPlayers = playerCounts.includes(pickedMaxPlayers) ? pickedMaxPlayers : playerCounts[playerCounts.length - 1];
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  /** 오류는 고칠 자리 옆에 — 아래 "방 만들기"를 누르고 위쪽 경고를 못 보는 일이 없게(UX 점검: 대전 입구 이름 오류) */
  const [error, setError] = useState<LobbyError | null>(null);
  /** 입력 오류 — 보이게 스크롤하고 그 칸으로 포커스 */
  const fieldError = (place: LobbyError["place"], message: string, fieldId: string) => {
    setError({ place, message, field: fieldId });
    const field = document.getElementById(fieldId);
    field?.scrollIntoView?.({ block: "center" });
    field?.focus();
  };
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

  // 안내 함수는 ref로 — 호출 쪽이 매 렌더 새 함수를 넘겨도 목록 effect가 다시 돌지 않게
  const errorMessageRef = useRef(battleErrorMessage);
  errorMessageRef.current = battleErrorMessage;

  // 연결될 때마다(재연결 포함) 목록을 받고 로비를 구독한다 — 재구독은 여기 한 곳에서만
  useEffect(() => {
    if (status !== "connected") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (attempt: number) => {
      const result = await listRooms();
      if (cancelled) return;
      setListError(result.ok ? null : errorMessageRef.current(result.code));
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
    if (resolved.error !== null) return fieldError("name", resolved.error, "battle-player-name");
    const finalRoomName = roomName.trim() ? roomName : `${resolved.name}의 방`;
    const roomNameProblem = validateRoomName(finalRoomName);
    if (roomNameProblem) return fieldError("create", roomNameProblem, "battle-room-name");
    const passwordProblem = validateRoomPassword(password);
    if (passwordProblem) return fieldError("create", passwordProblem, "battle-room-password");
    setError(null);
    setCreating(true);
    // 로비를 떠나면 아직 응답이 안 온 방 만들기는 버린다(enterScope — 늦게 성공하면 컨텍스트가 바로 나간다)
    // 공통 필드를 뒤에 — 게임별 값이 이름·인원을 덮지 못하게(인원은 playerCounts로 고른다)
    const result = await createRoom({
      ...createPayload,
      name: normalizeRoomName(finalRoomName),
      maxPlayers,
      password: password.length > 0 ? password : undefined,
      playerName: resolved.name,
    } as CP, enterScope);
    setCreating(false);
    if (!result.ok) return setError({ place: "create", message: battleErrorMessage(result.code) });
    player.remember(resolved.name);
    router.push(battleRoomPath(result.data.room.code));
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) return fieldError("code", "방 코드 6자리를 확인해 주세요.", "battle-room-code");
    setError(null);
    router.push(battleRoomPath(normalized));
  };

  /** 잠기지 않은 대기 방 중 사람이 가장 많은 곳으로 — 없으면 방 만들기로 안내 */
  const quickJoin = () => {
    const target = rooms ? pickQuickJoinRoom(rooms) : null;
    if (target) {
      router.push(battleRoomPath(target.code));
      return;
    }
    toast("바로 들어갈 방이 없어요. 방을 만들어 보세요.");
    const nameInput = document.getElementById("battle-room-name");
    nameInput?.scrollIntoView?.({ block: "center" });
    nameInput?.focus();
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain" style={{ touchAction: "pan-y" }}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3">
          <Link
            href={back.href}
            className="flex min-h-11 items-center rounded-xl border border-slate-700/60 bg-slate-900/70 px-3 text-xs text-slate-400 hover:text-slate-200"
          >
            {`← ${back.label}`}
          </Link>
          <ConnectionBadge status={status} onReconnect={reconnect} />
        </header>

        <section className={cardStyles}>
          <h1 className="text-2xl font-bold text-white">{intro.title}</h1>
          <p className="mt-1 text-sm text-slate-400">{intro.description}</p>
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
            aria-invalid={error?.field === "battle-player-name"}
            aria-describedby={error?.field === "battle-player-name" ? "battle-lobby-error" : undefined}
            className={`${baseInputStyles} mt-2 min-h-11 px-4 py-2`}
          />
          {error?.place === "name" && <LobbyAlert message={error.message} className="mt-3" />}
        </section>

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
          <RoomList rooms={rooms} error={listError} status={status} onReconnect={reconnect} roomPath={battleRoomPath} renderMeta={renderRoomMeta} />
          <Button type="button" variant="secondary" size="md" fullWidth className="mt-3 min-h-11" onClick={quickJoin} disabled={rooms === null}>
            빠른 참가
          </Button>
        </section>

        {renderLobbyChat?.({
          guestName: normalizePlayerName(player.name),
          resolveGuestName: () => {
            const resolved = player.resolve();
            if (resolved.error !== null) {
              fieldError("name", resolved.error, "battle-player-name");
              return null;
            }
            return resolved.name;
          },
          onGuestNameError: (message) => fieldError("name", message, "battle-player-name"),
        })}

        {/* 입구의 "방 만들기"가 여기로 온다(#battle-create) */}
        <form id="battle-create" onSubmit={submitCreate} className={`${cardStyles} scroll-mt-4`}>
          <h2 className="text-base font-semibold text-white">방 만들기</h2>
          <label htmlFor="battle-room-name" className="mt-3 block text-xs text-slate-400">
            방 이름 (비우면 &ldquo;내 이름의 방&rdquo;)
          </label>
          <input
            id="battle-room-name"
            value={roomName}
            aria-invalid={error?.field === "battle-room-name"}
            aria-describedby={error?.field === "battle-room-name" ? "battle-lobby-error" : undefined}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={ROOM_NAME_MAX_LENGTH * 2}
            className={`${baseInputStyles} mt-1 min-h-11 px-4 py-2`}
          />
          <fieldset className="mt-3">
            <legend className="text-xs text-slate-400">최대 인원</legend>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {playerCounts.map((n) => (
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
          {createFields}
          <label htmlFor="battle-room-password" className="mt-3 block text-xs text-slate-400">
            비밀번호 (선택)
          </label>
          <input
            id="battle-room-password"
            type="password"
            aria-invalid={error?.field === "battle-room-password"}
            aria-describedby={error?.field === "battle-room-password" ? "battle-lobby-error" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={ROOM_PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            className={`${baseInputStyles} mt-1 min-h-11 px-4 py-2`}
          />
          <Button type="submit" size="md" fullWidth className="mt-4 min-h-11" disabled={creating || status !== "connected"}>
            {creating ? "만드는 중..." : "방 만들기"}
          </Button>
          {error?.place === "create" && <LobbyAlert message={error.message} className="mt-3" />}
        </form>

        <form onSubmit={submitCode} className={cardStyles}>
          <label htmlFor="battle-room-code" className="text-base font-semibold text-white">
            코드로 입장
          </label>
          <div className="mt-3 flex gap-2">
            <input
              id="battle-room-code"
              value={code}
              aria-invalid={error?.field === "battle-room-code"}
              aria-describedby={error?.field === "battle-room-code" ? "battle-lobby-error" : undefined}
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
          {error?.place === "code" && <LobbyAlert message={error.message} className="mt-3" />}
        </form>
      </div>
    </div>
  );
}

/** field: 입력 오류면 그 칸 id(aria-invalid·describedby 연결), 서버 오류면 없음 */
type LobbyError = { place: "name" | "create" | "code"; message: string; field?: string };

function LobbyAlert({ message, className = "" }: { message: string; className?: string }) {
  return (
    <p id="battle-lobby-error" role="alert" className={`rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ${className}`}>
      {message}
    </p>
  );
}

type RoomListProps<S extends BaseRoomSummary> = {
  rooms: S[] | null;
  error: string | null;
  status: ConnectionStatus;
  onReconnect: () => void;
  roomPath: (code: string, locked?: boolean) => string;
  renderMeta?: (room: S) => ReactNode;
};

function RoomList<S extends BaseRoomSummary>({ rooms, error, status, onReconnect, roomPath, renderMeta }: RoomListProps<S>) {
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
                {renderMeta ? (
                  renderMeta(r)
                ) : (
                  <>
                    {r.playerCount}/{r.maxPlayers}명 · {r.status === "WAITING" ? "대기 중" : "진행 중"}
                  </>
                )}
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
