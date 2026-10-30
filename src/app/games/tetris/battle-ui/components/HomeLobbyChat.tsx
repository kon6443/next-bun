"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { normalizePlayerName } from "@/app/games/_shared/lib/playerName";
import { CHAT_TEXT_MAX_LENGTH } from "@/types/tetrisBattleSocket";
import { BattleSocketProvider, useBattleSocket } from "../contexts/BattleSocketContext";
import { useLobbyChat } from "../hooks/useLobbyChat";
import { lobbyChatOwnership, useLobbyChatComposer } from "../hooks/useLobbyChatComposer";
import { usePlayerName } from "../hooks/usePlayerName";
import { LOBBY_CHAT_HREF } from "../lib/battleList";
import { loadHiddenSenders } from "../lib/lobbyChatHidden";
import { LobbyChatBubble, lobbyChatRowAlign } from "./LobbyChatBubble";

/** 홈 카드에 보이는 최근 글 수 */
export const HOME_CHAT_LINES = 3;

/**
 * 테트리스 홈의 로비 채팅 카드(tetris-home-chat) — 최근 3줄 실시간 + 한 줄 입력. 전체(숨기기 포함)는 로비 #lobby-chat
 * 홈에 있는 동안만 대전 소켓을 연다 — 떠나면 provider가 연결을 끊는다(서버가 끊김으로 채팅 구독을 정리한다)
 * 연결·입장이 안 되면 카드 안에 안내만 — 홈의 다른 부분은 기다리지 않는다
 */
export function HomeLobbyChat() {
  return (
    <BattleSocketProvider>
      <HomeLobbyChatCard />
    </BattleSocketProvider>
  );
}

function HomeLobbyChatCard() {
  const chat = useLobbyChat();
  const { reconnect } = useBattleSocket();
  // 게스트 이름 — 저장된 마지막 이름(대전 로비와 같은 값). 없거나 거절되면 그때만 이름 칸을 펼친다
  const player = usePlayerName();
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameOpen, setNameOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    setHidden(loadHiddenSenders());
  }, []);

  // 숨긴 사람은 로비에서 고른 그대로(이 브라우저) — 홈에서는 숨기기 메뉴 없이 걸러 보이기만
  const { canHide, isMine } = lobbyChatOwnership(chat, normalizePlayerName(player.name));
  const shown = chat.messages.filter((m) => !(canHide(m) && hidden.includes(m.senderKey)));
  const recent = shown.slice(-HOME_CHAT_LINES);

  const askName = (message: string) => {
    setNameOpen(true);
    setNameError(message);
    requestAnimationFrame(() => document.getElementById("home-chat-name")?.focus());
  };
  const composer = useLobbyChatComposer(chat, {
    resolveGuestName: () => {
      const resolved = player.resolve();
      if (resolved.error !== null) {
        askName(resolved.error);
        return null;
      }
      return resolved.name;
    },
    onGuestNameError: askName,
    onSent: () => {
      // 이름 칸에서 Enter로 보냈다면 그 칸이 사라진다 — 포커스를 글 입력칸으로(모바일 키보드도 유지)
      if (document.activeElement?.id === "home-chat-name") document.getElementById("home-chat-input")?.focus();
      setNameOpen(false);
      setNameError(null);
    },
  });

  const notice =
    // 끊김(disconnected)은 socket.io가 다시 붙는 중이라 "연결 중"으로 — 재시도를 다 쓴 failed만 다시 시도 버튼
    chat.status === "failed" ? (
      <>
        채팅에 연결하지 못했어요.
        <RetryButton onClick={reconnect} />
      </>
    ) : chat.status !== "connected" ? (
      "채팅 연결 중…"
    ) : chat.join === "failed" ? (
      <>
        채팅에 들어가지 못했어요.
        <RetryButton onClick={chat.rejoin} />
      </>
    ) : !composer.ready ? (
      "채팅 연결 중…"
    ) : chat.messages.length === 0 ? (
      "아직 글이 없어요. 먼저 인사해 보세요!"
    ) : recent.length === 0 ? (
      "숨긴 사람의 글만 있어요."
    ) : null;
  const tooLong = composer.length > CHAT_TEXT_MAX_LENGTH;

  return (
    <section aria-labelledby="home-chat-title" className="rounded-3xl border border-white/10 bg-slate-900/80 px-3 pb-3 pt-1" data-testid="home-lobby-chat">
      <div className="flex items-center justify-between gap-2 pl-1">
        <h2 id="home-chat-title" className="text-sm font-semibold text-white">
          <span aria-hidden="true">💬 </span>로비 채팅
          {/* 들어올 때 받은 수다(실시간 갱신 이벤트 없음) — 로비 패널과 같이 시점을 밝힌다 */}
          {chat.onlineCount !== null && composer.ready && <span className="font-normal text-slate-400"> · 들어올 때 {chat.onlineCount}명</span>}
        </h2>
        <Link href={LOBBY_CHAT_HREF} aria-label="로비 채팅 전체 보기" className="flex min-h-11 shrink-0 items-center px-1 text-sm text-sky-300 hover:text-sky-200">
          전체 보기<span aria-hidden="true">&nbsp;›</span>
        </Link>
      </div>

      {/*
        3줄 자리를 늘 잡아 둔다 — 글이 오가도 아래(대전 카드)가 밀리지 않게
        라이브 영역(log·status)은 둘 다 늘 DOM에 둔다 — 먼저 있어야 첫 글·첫 안내도 읽힌다
        안내가 뜨는 동안(재연결 등) 글은 log에 그대로 두고 화면에서만 가린다(opacity) — 빼고 다시 넣으면 지난 글을 새 글처럼 다시 읽는다
      */}
      <div className="relative h-[5.75rem]">
        <ol
          role="log"
          aria-label="로비 채팅 최근 글"
          className={`flex h-full flex-col justify-end gap-1 overflow-hidden text-sm ${notice ? "opacity-0" : ""}`}
          data-testid="home-lobby-chat-list"
        >
          {recent.map((m) => (
            <li key={m.id} className={`${lobbyChatRowAlign(isMine(m))} min-w-0`} data-testid={`home-lobby-chat-message-${m.id}`}>
              <LobbyChatBubble message={m} mine={isMine(m)} compact />
            </li>
          ))}
        </ol>
        <div
          role="status"
          className={notice ? "absolute inset-0 flex flex-wrap items-center justify-center gap-x-2 text-center text-sm text-slate-400" : "sr-only"}
        >
          {notice}
        </div>
      </div>

      <form onSubmit={composer.submit} className="mt-2 flex flex-col gap-2">
        {nameOpen && (
          <div>
            <label htmlFor="home-chat-name" className="mb-1 block text-xs text-slate-400">
              채팅에 쓸 이름 (1~12자)
            </label>
            <input
              id="home-chat-name"
              value={player.name}
              onChange={(e) => {
                player.change(e.target.value);
                setNameError(null);
              }}
              autoComplete="nickname"
              enterKeyHint="send"
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? "home-chat-name-error" : undefined}
              className="min-h-11 w-full rounded-full border border-white/10 bg-slate-950/60 px-4 text-base text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
            {nameError && (
              <p id="home-chat-name-error" role="alert" className="mt-1 text-xs text-rose-300">
                {nameError}
              </p>
            )}
          </div>
        )}
        <div className="flex gap-2">
          <label htmlFor="home-chat-input" className="sr-only">
            로비 채팅에 보낼 글
          </label>
          <input
            id="home-chat-input"
            value={composer.text}
            onChange={(e) => composer.change(e.target.value)}
            enterKeyHint="send"
            autoComplete="off"
            aria-invalid={tooLong}
            aria-describedby={tooLong ? "home-chat-count" : undefined}
            placeholder={composer.ready ? "로비에 한마디" : "채팅 연결 중…"}
            className="min-h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/60 px-4 text-base text-white placeholder:text-slate-500 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
          <button
            type="submit"
            disabled={!composer.canSend}
            className="min-h-11 shrink-0 rounded-full border border-sky-400/50 px-4 text-sm font-semibold text-sky-100 hover:bg-sky-500/10 disabled:opacity-40"
          >
            {composer.sending ? "보내는 중" : "보내기"}
          </button>
        </div>
      </form>
      {tooLong && (
        <p id="home-chat-count" className="mt-1 text-right text-xs text-rose-300">
          {composer.length}/{CHAT_TEXT_MAX_LENGTH}
        </p>
      )}
      {composer.error && (
        <p role="alert" className="mt-1 text-sm text-rose-300">
          {composer.error}
        </p>
      )}
    </section>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 px-2 font-semibold text-sky-300 hover:text-sky-200">
      다시 시도
    </button>
  );
}
