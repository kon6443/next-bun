// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TurnTimer, useTurnGate } from "./matchLive";

const T0 = 1_000_000;
/** 3초 뒤 시작, 시작부터 10초 턴 */
const feed = { startAt: T0 + 3000, turnAt: T0, turn: { slot: 0, seq: 1, remainingMs: 13_000 } } as unknown as Parameters<typeof useTurnGate>[0] & object;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useTurnGate — 온라인 턴 잠금은 바뀔 때만 다시 그린다 (B7)", () => {
  it("14초 동안 250ms마다 시각을 보지만 다시 그리는 건 시작·시간 끝 두 번뿐", () => {
    let renders = 0;
    const seen: string[] = [];
    function Probe() {
      renders++;
      const { started, expired } = useTurnGate(feed);
      seen.push(`${started}:${expired}`);
      return null;
    }
    render(<Probe />);
    const first = renders;
    // 한 act 안의 갱신은 한 번에 그려지니 화면 프레임처럼 250ms씩 따로 진행한다
    for (let t = 0; t < 14_000; t += 250) {
      act(() => {
        vi.advanceTimersByTime(250);
      });
    }
    expect(renders - first).toBe(2);
    expect(seen.at(0)).toBe("false:false");
    expect(seen.at(-1)).toBe("true:true");
    expect(seen).toContain("true:false");
  });

  it("혼자하기(피드 없음)는 늘 시작됨·시간 남음", () => {
    let gate = { started: false, expired: true };
    function Probe() {
      gate = useTurnGate(undefined);
      return null;
    }
    render(<Probe />);
    expect(gate).toEqual({ started: true, expired: false });
  });
});

describe("TurnTimer — 남은 시간 문구", () => {
  it("시작 전 「곧 시작 N」, 시작 뒤 「⏱ N초」 — 5초 이하면 경고색", () => {
    render(<TurnTimer feed={feed} warnMs={5000} />);
    expect(screen.getByTestId("fortress-timer")).toHaveTextContent("곧 시작 3");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByTestId("fortress-timer")).toHaveTextContent("⏱ 10초");
    expect(screen.getByTestId("fortress-timer").className).not.toContain("rose");
    act(() => {
      vi.advanceTimersByTime(5250);
    });
    expect(screen.getByTestId("fortress-timer")).toHaveTextContent("⏱ 5초");
    expect(screen.getByTestId("fortress-timer").className).toContain("rose");
  });
});
