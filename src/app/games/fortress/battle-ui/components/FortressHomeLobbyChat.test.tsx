// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type Handler = (payload: unknown) => void;

/** 포트리스 소켓 대역 — 채팅 입장(joinLobbyChat) ack만 돌려준다 */
const io = vi.hoisted(() => {
  const handlers = new Map<string, Set<Handler>>();
  const emitted: string[] = [];
  const socket = {
    connected: true,
    on: (event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: Handler) => handlers.get(event)?.delete(handler),
    emit: (event: string) => emitted.push(event),
    timeout: () => ({
      emitWithAck: async (event: string) => {
        emitted.push(event);
        if (event === "joinLobbyChat") return { ok: true, data: { messages: [{ id: "1", senderKey: "k-1", name: "포격수", isGuest: false, text: "한판 해요", at: "2026-11-09T01:00:00.000Z" }], me: { isGuest: true, name: null, senderKey: "k-me" }, onlineCount: 2 } };
        return new Promise(() => {});
      },
    }),
  };
  return { socket, emitted };
});
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("../contexts/FortressSocketContext", () => ({
  FortressSocketProvider: ({ children }: { children: ReactNode }) => children,
  useFortressSocket: () => ({ socket: io.socket, status: "connected", reconnect: () => {} }),
}));

import { FortressHomeLobbyChat } from "./FortressHomeLobbyChat";

describe("포트리스 홈 로비 채팅 카드 (D-022)", () => {
  it("포트리스 소켓으로 로비 채팅에 들어가 최근 글을 보이고, 전체 보기는 포트리스 로비의 채팅 칸", async () => {
    await act(async () => render(<FortressHomeLobbyChat />));
    expect(io.emitted).toContain("joinLobbyChat");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("💬 로비 채팅 · 들어올 때 2명");
    expect(screen.getByRole("link", { name: "로비 채팅 전체 보기" }).getAttribute("href")).toBe("/games/fortress/battle#lobby-chat");
    expect(screen.getByTestId("home-lobby-chat-message-1").textContent).toContain("한판 해요");
  });
});
