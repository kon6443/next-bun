// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "../engine";
import { canReplayVersion } from "../engine-versions";
import { FortressReplay } from "./FortressReplay";

afterEach(cleanup);

const config = { seed: 1, mapId: "hills" as const, mode: "ffa" as const, players: [{ slot: 0, team: 0, tankId: 0 }, { slot: 1, team: 0, tankId: 1 }] };

describe("리플레이 엔진 버전 (D-023 v2)", () => {
  it("v1 엔진은 보관하지 않는다 — v1 기록(배포 전 시험 경기)은 재생 불가 안내, 지금 버전만 재생", async () => {
    expect(ENGINE_VERSION).toBe(2);
    expect(canReplayVersion(1)).toBe(false);
    expect(canReplayVersion(ENGINE_VERSION)).toBe(true);
    await act(async () => {
      render(<FortressReplay data={{ engineVersion: 1, config, actions: [] }} controllers={["human", "human"]} onClose={() => {}} />);
    });
    expect(screen.getByRole("alert").textContent).toBe("이 기록의 엔진 버전은 재생할 수 없어요.");
    expect(screen.getByRole("button", { name: "결과로 돌아가기" })).toBeTruthy();
  });
});
