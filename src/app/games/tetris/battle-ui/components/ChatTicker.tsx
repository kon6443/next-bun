"use client";

import { useEffect, useRef, useState } from "react";
import type { ReceivedChat } from "../contexts/BattleSocketContext";

/** 자막 한 줄이 떠 있는 시간 */
export const CHAT_TICKER_SHOW_MS = 4000;
/** 한 번에 보이는 줄 수 */
const TICKER_LINES = 2;

/**
 * 경기 중(살아 있는 동안) 채팅 자막 (D-016) — 새로 온 메시지만 판 위쪽 구석에 작게 잠깐 띄운다. 입력은 없다(이모트만)
 * 판을 가리지 않게 누를 수 없고(pointer-events-none) 최근 두 줄만
 */
export function ChatTicker({ messages }: { messages: ReceivedChat[] }) {
  const [shown, setShown] = useState<ReceivedChat[]>([]);
  // 마운트 때 이미 받은 메시지(대기실 대화 등)는 띄우지 않는다
  const seenKeyRef = useRef(messages.at(-1)?.key ?? 0);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const fresh = messages.filter((m) => m.key > seenKeyRef.current);
    if (fresh.length === 0) return;
    seenKeyRef.current = fresh[fresh.length - 1].key;
    setShown((prev) => [...prev, ...fresh].slice(-TICKER_LINES));
    for (const m of fresh) {
      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        setShown((prev) => prev.filter((s) => s.key !== m.key));
      }, CHAT_TICKER_SHOW_MS);
      timersRef.current.add(timer);
    }
  }, [messages]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  // 알림 영역(aria-live)은 늘 두고 안의 줄만 바꾼다 — 내용과 함께 새로 생기면 스크린리더가 첫 줄을 읽지 않는다
  // 왼쪽 아래 구석 — 왼쪽 위는 내 이모트 말풍선 자리다
  return (
    <ol className="pointer-events-none absolute bottom-2 left-2 z-[5] flex max-w-[55%] flex-col gap-0.5" aria-live="polite" aria-label="채팅">
      {shown.map((m) => (
        <li key={m.key} className="truncate rounded-md bg-slate-950/70 px-2 py-0.5 text-[11px] leading-tight text-slate-200">
          <span className="font-semibold text-slate-400">{m.name}</span> {m.text}
        </li>
      ))}
    </ol>
  );
}
