"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatTimeOfDay } from "@/app/utils/dateUtils";
import { CHAT_TEXT_MAX_LENGTH, type LobbyChatMessage, TetrisBattleErrorCodes } from "@/types/tetrisBattleSocket";
import { useLobbyChat } from "../hooks/useLobbyChat";
import { battleErrorMessage } from "../lib/battleErrors";
import { LOBBY_CHAT_SECTION_ID } from "../lib/battleList";
import { loadHiddenSenders, saveHiddenSenders } from "../lib/lobbyChatHidden";

/** 글자 수는 서버와 같게 코드포인트(이모지 한 개 = 1자)로 센다 */
const countChars = (text: string) => [...text.trim()].length;

/** 한 줄 입력 — 붙여넣은 탭(줄바꿈은 입력칸이 먼저 거른다)은 공백으로. 서버는 줄바꿈·제어 문자가 있으면 CHAT_FORBIDDEN */
const oneLine = (text: string) => text.replace(/[\r\n\t]+/g, " ");

/** 맨 아래로 붙어 있다고 보는 여유(px) — 그 안이면 새 글이 오면 따라 내려간다 */
const STICK_SLACK = 24;

type Props = {
  /** 로비 이름 칸의 지금 이름(정규화) — 내 키를 가진 게스트 글 중 이름이 같은 것만 "내 글" 색으로 칠한다(보이기·숨기기와 무관) */
  guestName: string;
  /** 게스트가 보낼 이름 — 로비 위쪽 이름 칸의 값. 문제가 있으면 그 칸에 오류를 보이고 null */
  resolveGuestName: () => string | null;
  /** 서버가 게스트 이름을 거절했다(NAME_INVALID·NAME_FORBIDDEN) — 로비 이름 칸에 보인다 */
  onGuestNameError: (message: string) => void;
};

/**
 * 테트리스 로비 전체 채팅 패널(tetris-chat) — 게스트도 쓴다. 최근 50개·30분만 서버에 남는다(저장 안 함)
 * - 게스트 글에는 늘 "게스트" 표시 — 서버는 게스트 이름이 회원 이름과 같아도 막지 않는다(운영자 사칭만 막음). 구분 수단은 isGuest뿐
 * - 이름·글은 글자로만 그린다(서버가 HTML 이스케이프를 하지 않는다 — dangerouslySetInnerHTML 금지)
 * - 다른 사람 글을 누르면 "이 사람 숨기기" — 이 브라우저에만(senderKey). 숨긴 사람은 "모두 보이기"로 되돌린다
 * - senderKey가 me.senderKey와 같은 글(과 이 화면에서 보낸 글)은 숨길 수 없다 — 숨기면 내 글도 함께 가려진다.
 *   게스트 키는 IP 기준이라 같은 공유기의 다른 게스트도 여기에 든다(서버 한계)
 * - "내 글" 색은 그중 회원 글, 또는 이름이 지금 이름 칸과 같은 게스트 글 — 색만 바뀌고 보이기·숨기기에는 쓰지 않는다
 * - 목록은 role=log(새 글을 읽어 준다). 맨 아래에 있을 때만 새 글을 따라 내려간다(위 글을 읽는 중이면 그대로)
 */
export function LobbyChatPanel({ guestName, resolveGuestName, onGuestNameError }: Props) {
  const chat = useLobbyChat();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  /** 숨기기 메뉴를 연 글 */
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    setHidden(loadHiddenSenders());
  }, []);

  const myKey = chat.me?.senderKey ?? null;
  const sentByMe = (m: LobbyChatMessage) => chat.myMessageIds.has(String(m.id));
  const hasMyKey = (m: LobbyChatMessage) => myKey !== null && m.senderKey === myKey;
  const canHide = (m: LobbyChatMessage) => !sentByMe(m) && !hasMyKey(m);
  const isMine = (m: LobbyChatMessage) => sentByMe(m) || (hasMyKey(m) && (!m.isGuest || m.name === guestName));
  const isHidden = (m: LobbyChatMessage) => canHide(m) && hidden.includes(m.senderKey);
  const visible = chat.messages.filter((m) => !isHidden(m));
  const hiddenCount = new Set(chat.messages.filter(isHidden).map((m) => m.senderKey)).size;
  /** 글 수는 상한(100)에 닿으면 그대로라 마지막 글로 새 글을 안다 */
  const lastVisibleId = visible.at(-1)?.id;

  const scrollToBottom = () => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  };

  // 새 글 — 맨 아래에 붙어 있었으면 따라 내려간다
  useLayoutEffect(() => {
    if (stickRef.current) scrollToBottom();
  }, [lastVisibleId]);

  const onScroll = () => {
    const list = listRef.current;
    if (list) stickRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= STICK_SLACK;
  };

  const hide = (senderKey: string) => {
    const next = [...hidden.filter((k) => k !== senderKey), senderKey];
    setHidden(next);
    saveHiddenSenders(next);
    setSelected(null);
    // 누른 행이 사라진다 — 포커스를 목록으로
    listRef.current?.focus();
  };
  const showAll = () => {
    setHidden([]);
    saveHiddenSenders([]);
  };

  const length = countChars(text);
  // 들어가는 중에도 입력칸은 열어 둔다(disabled면 포커스·모바일 키보드가 닫힌다) — 보내기만 막는다
  const ready = chat.join === "joined" && chat.status === "connected";
  const canSend = ready && !sending && length > 0 && length <= CHAT_TEXT_MAX_LENGTH;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    let sendName: string | undefined;
    if (chat.me?.isGuest) {
      const name = resolveGuestName();
      if (!name) return;
      sendName = name;
    }
    // 보내면 바로 비운다 — 기다리는 동안 이어 친 글에 보낸 글이 섞이지 않게. 실패하면 칸이 비어 있을 때만 되돌린다
    const submitted = text;
    setText("");
    setSending(true);
    setError(null);
    const result = await chat.send(submitted.trim(), sendName);
    setSending(false);
    if (!result.ok) setText((current) => (current === "" ? submitted : current));
    if (result.ok) {
      // 방송이 ack보다 먼저 와 이미 그려졌을 수도 있다 — 직접 내려간다
      stickRef.current = true;
      scrollToBottom();
      return;
    }
    if (result.code === TetrisBattleErrorCodes.NAME_INVALID || result.code === TetrisBattleErrorCodes.NAME_FORBIDDEN) {
      onGuestNameError(battleErrorMessage(result.code));
      return;
    }
    setError(
      result.code === TetrisBattleErrorCodes.RATE_LIMITED
        ? "너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요."
        : result.code === TetrisBattleErrorCodes.INVALID_PAYLOAD
          ? `글은 1~${CHAT_TEXT_MAX_LENGTH}자로 보내 주세요.`
          : battleErrorMessage(result.code),
    );
  };

  return (
    <section id={LOBBY_CHAT_SECTION_ID} aria-labelledby="lobby-chat-title" className="scroll-mt-4 rounded-3xl border border-white/10 bg-slate-900/80 p-4" data-testid="lobby-chat">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="lobby-chat-title" className="text-base font-semibold text-white">
          로비 채팅
        </h2>
        {chat.onlineCount !== null && <span className="text-xs text-slate-400">들어올 때 {chat.onlineCount}명</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">최근 30분 글만 보여요. 게스트도 쓸 수 있어요.</p>

      {chat.status !== "connected" ? (
        // 연결 상태는 로비 위쪽이 이미 알린다(role=status) — 여기서는 조용히 덧붙이기만
        <p className="mt-3 text-sm text-slate-400">연결되면 채팅을 다시 불러와요.</p>
      ) : chat.join === "failed" ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-400" role="status">
          채팅에 들어가지 못했어요.
          <button type="button" onClick={chat.rejoin} className="min-h-11 px-2 font-semibold text-sky-300 hover:text-sky-200">
            다시 시도
          </button>
        </p>
      ) : null}

      <ol
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-label="로비 채팅 글"
        tabIndex={0}
        className="mt-3 flex max-h-72 min-h-24 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-2xl bg-slate-950/50 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
        data-testid="lobby-chat-list"
      >
        {visible.length === 0 && chat.join === "joined" && <li className="px-2 py-3 text-center text-sm text-slate-500">아직 글이 없어요. 먼저 인사해 보세요!</li>}
        {visible.map((m) => (
          <ChatRow
            key={m.id}
            message={m}
            mine={isMine(m)}
            hideable={canHide(m)}
            selected={selected === m.id}
            onSelect={() => setSelected((s) => (s === m.id ? null : m.id))}
            onHide={() => hide(m.senderKey)}
          />
        ))}
      </ol>
      {hiddenCount > 0 && (
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          숨긴 사람 {hiddenCount}명
          <button type="button" onClick={showAll} className="min-h-11 px-2 text-sky-300 hover:text-sky-200">
            모두 보이기
          </button>
        </p>
      )}

      <form onSubmit={submit} className="mt-2 flex gap-2">
        <label htmlFor="lobby-chat-input" className="sr-only">
          보낼 글
        </label>
        <input
          id="lobby-chat-input"
          value={text}
          onChange={(e) => {
            setText(oneLine(e.target.value));
            setError(null);
          }}
          enterKeyHint="send"
          autoComplete="off"
          aria-invalid={length > CHAT_TEXT_MAX_LENGTH}
          aria-describedby="lobby-chat-count"
          placeholder={ready ? "글을 입력하세요" : chat.status === "connected" && chat.join === "joining" ? "채팅에 들어가는 중…" : "지금은 보낼 수 없어요"}
          className="min-h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/60 px-4 text-base text-white placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="min-h-11 shrink-0 rounded-full border border-sky-400/50 px-4 text-sm font-semibold text-sky-100 hover:bg-sky-500/10 disabled:opacity-40"
        >
          {sending ? "보내는 중" : "보내기"}
        </button>
      </form>
      <p id="lobby-chat-count" className={`mt-1 text-right text-xs ${length > CHAT_TEXT_MAX_LENGTH ? "text-rose-300" : "text-slate-500"}`}>
        {length}/{CHAT_TEXT_MAX_LENGTH}
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
}

type RowProps = { message: LobbyChatMessage; mine: boolean; hideable: boolean; selected: boolean; onSelect: () => void; onHide: () => void };

/** 글 한 줄 — 이름(게스트 표시)·시각·내용은 모두 글자로. 숨길 수 있는 글은 눌러 숨기기 메뉴를 연다 */
function ChatRow({ message, mine, hideable, selected, onSelect, onHide }: RowProps) {
  const rowButtonRef = useRef<HTMLButtonElement>(null);
  const body = (
    <>
      <span className={`font-semibold ${mine ? "text-sky-300" : "text-slate-200"}`}>{message.name}</span>
      {message.isGuest && (
        <span className="ml-1 rounded-full bg-slate-700/70 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-300" data-testid="lobby-chat-guest">
          게스트
        </span>
      )}
      <span className="ml-1.5 text-[11px] text-slate-500">{formatTimeOfDay(new Date(message.at))}</span>
      <span className="block break-words text-slate-100">{message.text}</span>
    </>
  );
  if (!hideable) {
    return (
      <li className="rounded-xl px-2 py-1.5 text-sm" data-testid={`lobby-chat-message-${message.id}`}>
        {body}
      </li>
    );
  }
  return (
    <li className="text-sm" data-testid={`lobby-chat-message-${message.id}`}>
      <button
        ref={rowButtonRef}
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className={`block min-h-11 w-full rounded-xl px-2 py-1.5 text-left ${selected ? "bg-white/5" : "hover:bg-white/5"}`}
      >
        {body}
      </button>
      {selected && (
        <div className="flex gap-2 px-2 pb-1">
          <button type="button" onClick={onHide} className="min-h-11 rounded-full border border-rose-400/40 px-3 text-xs font-semibold text-rose-200 hover:bg-rose-500/10">
            {message.name} 님 글 숨기기
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect();
              // 닫기 버튼이 사라진다 — 연 글로 포커스를 돌린다
              rowButtonRef.current?.focus();
            }}
            className="min-h-11 rounded-full border border-white/20 px-3 text-xs text-slate-300"
          >
            닫기
          </button>
        </div>
      )}
    </li>
  );
}
