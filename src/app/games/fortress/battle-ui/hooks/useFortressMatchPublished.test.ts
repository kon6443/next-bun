// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFortressMatch = vi.hoisted(() => vi.fn());
vi.mock("@/services/fortressService", () => ({ getFortressMatch }));

import { ApiError } from "@/types/api";
import { PUBLISH_POLL_LIMIT_MS, PUBLISH_POLL_MS, useFortressMatchPublished } from "./useFortressMatchPublished";

const notFound = () => new ApiError("FORTRESS_MATCH_NOT_FOUND", "x", 404);

beforeEach(() => {
  vi.useFakeTimers();
  getFortressMatch.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("경기 저장 대기(useFortressMatchPublished)", () => {
  it("404면 3초마다 다시 묻고 200이면 멈춘다, matchId가 없으면 idle", async () => {
    getFortressMatch.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({ data: { matchId: "m1" } });
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useFortressMatchPublished(id), { initialProps: { id: "m1" as string | null } });
    await act(async () => {});
    expect(result.current.status).toBe("waiting");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_MS);
    });
    expect(result.current).toEqual({ status: "ready", match: { matchId: "m1" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_MS * 3);
    });
    expect(getFortressMatch).toHaveBeenCalledTimes(2);
    rerender({ id: null });
    expect(result.current.status).toBe("idle");
  });

  it("한도까지 404면 unavailable, 다시 보내도 같은 실패(400대)는 바로 unavailable", async () => {
    getFortressMatch.mockImplementation(() => Promise.reject(notFound()));
    const { result, unmount } = renderHook(() => useFortressMatchPublished("m1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PUBLISH_POLL_LIMIT_MS);
    });
    expect(result.current.status).toBe("unavailable");
    unmount();

    getFortressMatch.mockReset();
    getFortressMatch.mockRejectedValueOnce(new ApiError("VALIDATION_ERROR", "x", 422));
    const second = renderHook(() => useFortressMatchPublished("m2"));
    await act(async () => {});
    expect(second.result.current.status).toBe("unavailable");
  });
});
