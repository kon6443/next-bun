import { describe, expect, it } from "vitest";
import { ApiError } from "@/types/api";
import { isRetryableListError } from "./FortressMatchArchive";

describe("isRetryableListError — 다시 보내면 나아질 수 있는 실패만", () => {
  it("네트워크(ApiError 아님)·429·5xx는 재시도", () => {
    expect(isRetryableListError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableListError(new ApiError("TOO_MANY", "잠시 뒤", 429))).toBe(true);
    expect(isRetryableListError(new ApiError("SERVER", "오류", 500))).toBe(true);
    expect(isRetryableListError(new ApiError("BAD_GATEWAY", "오류", 503))).toBe(true);
  });

  it("그 밖의 4xx(커서 무효 422 등)는 처음부터", () => {
    expect(isRetryableListError(new ApiError("VALIDATION_ERROR", "커서", 422))).toBe(false);
    expect(isRetryableListError(new ApiError("NOT_FOUND", "없음", 404))).toBe(false);
  });
});
