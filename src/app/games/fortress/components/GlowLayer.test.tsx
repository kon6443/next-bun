// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// three 후처리는 대역 — 만들기 성공/실패, 그리기 시간만 바꾼다
const post = vi.hoisted(() => ({ create: true, renderMs: 1, renders: 0, disposed: 0, throws: false }));
vi.mock("../renderer/glowPost", () => ({
  createGlowPost: () =>
    post.create
      ? {
          render: () => {
            if (post.throws) throw new Error("gl");
            post.renders++;
            const until = performance.now() + post.renderMs;
            while (performance.now() < until) {
              // 그리기 시간 흉내
            }
          },
          dispose: () => {
            post.disposed++;
          },
        }
      : null,
}));

import type { BattleFrame } from "../hooks/useBattleView";
import { GLOW_SLOW_MS, useGlowLayer } from "./GlowLayer";

const frame: BattleFrame = { source: document.createElement("canvas"), width: 100, height: 60, time: 0, reducedMotion: false, flash: 0, blasts: [], quality: "high", slow: false };

function Harness({ enabled }: { enabled: boolean }) {
  const glow = useGlowLayer(enabled);
  return (
    <div>
      {glow.layer}
      <span data-testid="state">{`${glow.onFrame ? "on" : "off"}:${glow.active ? "active" : "idle"}`}</span>
      <button type="button" onClick={() => glow.onFrame?.(frame)}>
        frame
      </button>
      <button type="button" onClick={() => glow.onFrame?.({ ...frame, quality: "low" })}>
        low
      </button>
      <button type="button" onClick={() => glow.onFrame?.({ ...frame, slow: true })}>
        slow
      </button>
    </div>
  );
}

const flush = () => act(async () => await Promise.resolve().then(() => new Promise((r) => setTimeout(r, 0))));

beforeEach(() => {
  post.create = true;
  post.renderMs = 0;
  post.renders = 0;
  post.disposed = 0;
  post.throws = false;
});
afterEach(cleanup);

describe("useGlowLayer — 시안 glow 후처리 층 (D-025 B)", () => {
  it("꺼져 있으면 층·onFrame이 없다(three를 불러오지 않는다)", () => {
    const { result } = renderHook(() => useGlowLayer(false));
    expect(result.current.layer).toBeNull();
    expect(result.current.onFrame).toBeUndefined();
  });

  it("켜면 층이 생기고 후처리가 준비되면 active, 프레임을 그린다", async () => {
    render(<Harness enabled />);
    expect(screen.getByTestId("fortress-glow")).toBeInTheDocument();
    await flush();
    expect(screen.getByTestId("state").textContent).toBe("on:active");
    act(() => screen.getByText("frame").click());
    expect(post.renders).toBe(1);
  });

  it("WebGL을 못 만들면 스스로 꺼진다(층·onFrame 없음 — 전장은 vivid 그대로)", async () => {
    post.create = false;
    render(<Harness enabled />);
    await flush();
    expect(screen.queryByTestId("fortress-glow")).toBeNull();
    expect(screen.getByTestId("state").textContent).toBe("off:idle");
  });

  it(`후처리가 느리면(평균 ${GLOW_SLOW_MS}ms 초과) 몸풀기 프레임 뒤 꺼지고 정리한다`, async () => {
    post.renderMs = GLOW_SLOW_MS + 4;
    render(<Harness enabled />);
    await flush();
    for (let i = 0; i < 40; i++) act(() => screen.getByText("frame").click());
    await flush();
    expect(screen.queryByTestId("fortress-glow")).toBeNull();
    expect(post.disposed).toBe(1);
  });

  it("빠르면 계속 켜져 있다", async () => {
    post.renderMs = 0;
    render(<Harness enabled />);
    await flush();
    for (let i = 0; i < 40; i++) act(() => screen.getByText("frame").click());
    await flush();
    expect(screen.getByTestId("state").textContent).toBe("on:active");
  });

  it("전장 자동 품질이 low로 내려가면(느린 기기) 꺼진다", async () => {
    render(<Harness enabled />);
    await flush();
    act(() => screen.getByText("low").click());
    await flush();
    expect(screen.queryByTestId("fortress-glow")).toBeNull();
    expect(post.renders).toBe(0);
  });

  it("후처리가 예외를 던지면 꺼지고 예외를 밖(전장 루프)으로 내보내지 않는다", async () => {
    post.throws = true;
    render(<Harness enabled />);
    await flush();
    expect(() => act(() => screen.getByText("frame").click())).not.toThrow();
    await flush();
    expect(screen.queryByTestId("fortress-glow")).toBeNull();
  });

  it("후처리가 켜진 동안 프레임이 밀린다는 신호(slow)가 오면 꺼진다 — 전장 품질은 그대로 둔 채", async () => {
    render(<Harness enabled />);
    await flush();
    act(() => screen.getByText("slow").click());
    await flush();
    expect(screen.queryByTestId("fortress-glow")).toBeNull();
  });

  it("WebGL 컨텍스트를 잃으면 꺼진다", async () => {
    render(<Harness enabled />);
    await flush();
    const canvas = screen.getByTestId("fortress-glow");
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    await flush();
    expect(screen.queryByTestId("fortress-glow")).toBeNull();
  });
});
