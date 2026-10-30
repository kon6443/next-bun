"use client";

import { formatTimeOfDay } from "@/app/utils/dateUtils";
import type { LobbyChatMessage } from "@/types/tetrisBattleSocket";

/** 게스트 표시 — 게스트 글에는 늘(내 글 포함). 서버는 게스트 이름이 회원 이름과 같아도 막지 않아 구분 수단은 이것뿐이다 */
function GuestBadge() {
  return (
    <span className="rounded-full bg-slate-700/70 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-300" data-testid="lobby-chat-guest">
      게스트
    </span>
  );
}

type Props = {
  message: LobbyChatMessage;
  mine: boolean;
  /** 홈 카드 — 한 줄로 줄이고 넘치면 말줄임(시각 생략) */
  compact?: boolean;
};

/**
 * 로비 채팅 글 말풍선(tetris-chat) — 이름·글은 모두 글자로(dangerouslySetInnerHTML 금지)
 * 내 글은 오른쪽 강조색(이름 생략, 시각 유지), 남의 글은 왼쪽(이름·게스트 표시·시각). 스크린리더에는 "나:"·"이름:"으로 구분
 * 정렬(왼쪽·오른쪽)은 감싸는 줄이 정한다 — lobbyChatRowAlign. 테두리는 ring(inset) — 높이를 늘리지 않아 홈 카드의 고정 3줄 자리에 맞는다
 */
export function LobbyChatBubble({ message, mine, compact = false }: Props) {
  const time = formatTimeOfDay(new Date(message.at));
  if (mine) {
    return (
      <span className={`inline-block max-w-[85%] rounded-2xl rounded-br-md bg-sky-500/20 ring-1 ring-inset ring-sky-400/30 px-3 text-left ${compact ? "truncate py-1" : "py-1.5"}`}>
        <span className="sr-only">나: </span>
        {message.isGuest && (
          <span className="mr-1">
            <GuestBadge />
          </span>
        )}
        <span className={`text-sky-50 ${compact ? "" : "break-words"}`}>{message.text}</span>
        {!compact && <span className="ml-1.5 whitespace-nowrap text-[11px] text-sky-200/70">{time}</span>}
      </span>
    );
  }
  return (
    <span className={`inline-block max-w-[85%] rounded-2xl rounded-bl-md bg-slate-800/80 px-3 text-left ${compact ? "truncate py-1" : "py-1.5"}`}>
      <span className="font-semibold text-slate-200">{message.name}</span>
      {message.isGuest && (
        <span className="ml-1">
          <GuestBadge />
        </span>
      )}
      <span className="sr-only">: </span>
      {compact ? (
        <span className="ml-1.5 text-slate-100">{message.text}</span>
      ) : (
        <>
          <span className="ml-1.5 text-[11px] text-slate-500">{time}</span>
          <span className="block break-words text-slate-100">{message.text}</span>
        </>
      )}
    </span>
  );
}

/** 말풍선 줄 정렬 — 내 글은 오른쪽 */
export const lobbyChatRowAlign = (mine: boolean) => (mine ? "flex justify-end" : "flex justify-start");
