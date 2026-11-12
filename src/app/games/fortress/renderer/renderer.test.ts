import { describe, it, expect } from "vitest";
import { BLAST_MIN_PX, blastDrawRadius, drawTank, offscreenChipLayout, tankDrawScale } from "./drawScene";
import { type MatchConfig, type MatchEvent, type MatchState, MOVE_PX_PER_TICK, type Tank, type Terrain, WORLD_HEIGHT, WORLD_WIDTH, applyAction, carveCircle, createMatch, eventsEndTick } from "../engine";
import { MAX_ZOOM, SKY_MARGIN, clampCamera, minZoom, panBy, screenToWorld, worldToScreen, zoomAt } from "./camera";
import { EXPLOSION_TICKS, FALL_TICKS, TAIL_TICKS, blastsAt, explosionsUntil, playbackEnd, shellsAt, tanksAt } from "./playback";

const view = { width: 390, height: 600 };

describe("camera", () => {
  it("배율은 [가로 전체가 보이는 배율, MAX_ZOOM], 중심은 월드(+하늘 여백) 안", () => {
    const far = clampCamera({ cx: -5000, cy: 9999, zoom: 0.001 }, view);
    expect(far.zoom).toBe(minZoom(view));
    expect(far.cx).toBe(WORLD_WIDTH / 2);
    const near = clampCamera({ cx: -5000, cy: 9999, zoom: 99 }, view);
    expect(near.zoom).toBe(MAX_ZOOM);
    expect(near.cx).toBeCloseTo(view.width / MAX_ZOOM / 2);
    expect(near.cy).toBeCloseTo(WORLD_HEIGHT - view.height / MAX_ZOOM / 2);
    expect(clampCamera({ cx: 1000, cy: -9999, zoom: 1 }, view).cy).toBeCloseTo(-SKY_MARGIN + view.height / 2);
  });

  it("세로가 월드보다 길게 보이는 배율이면 바닥을 화면 아래에 맞춘다(월드 아래가 보이지 않게)", () => {
    const tall = { width: 390, height: 700 };
    const c = clampCamera({ cx: 1000, cy: 0, zoom: 0.3 }, tall);
    expect(c.cy + tall.height / c.zoom / 2).toBeCloseTo(WORLD_HEIGHT);
  });

  it("worldToScreen ↔ screenToWorld 왕복", () => {
    const cam = { cx: 700, cy: 400, zoom: 0.8 };
    const [sx, sy] = worldToScreen(cam, view, 812, 345);
    const [wx, wy] = screenToWorld(cam, view, sx, sy);
    expect(wx).toBeCloseTo(812);
    expect(wy).toBeCloseTo(345);
  });

  it("zoomAt은 손가락 아래 월드 점을 고정한다", () => {
    const cam = { cx: 1000, cy: 500, zoom: 1 };
    const before = screenToWorld(cam, view, 100, 200);
    const zoomed = zoomAt(cam, view, 100, 200, 1.5);
    const after = screenToWorld(zoomed, view, 100, 200);
    expect(after[0]).toBeCloseTo(before[0]);
    expect(after[1]).toBeCloseTo(before[1]);
  });

  it("panBy — 끈 방향으로 내용이 따라온다(중심은 반대)", () => {
    const cam = { cx: 1000, cy: 500, zoom: 2 };
    const moved = panBy(cam, view, 40, -20);
    expect(moved.cx).toBe(980);
    expect(moved.cy).toBe(510);
  });
});

describe("playback", () => {
  const config: MatchConfig = {
    seed: 5,
    mapId: "hills",
    mode: "ffa",
    players: [
      { slot: 0, team: 0, tankId: 0 },
      { slot: 1, team: 0, tankId: 1 },
    ],
  };
  const created = createMatch(config);
  if (!created.ok) throw new Error(created.reason);
  const state = created.state;
  // 땅에 닿아 폭발하는 첫 발
  let events: MatchEvent[] = [];
  for (const angle of [60, 120]) {
    for (let power = 30; power <= 100 && !events.some((e) => e.type === "explode"); power += 10) {
      const r = applyAction(state, { kind: "fire", move: 12, angle, power, weaponId: 0 });
      if (r.ok) events = r.events;
    }
  }
  const shot = events.find((e) => e.type === "shot") as Extract<MatchEvent, { type: "shot" }>;
  const blast = events.find((e) => e.type === "explode") as Extract<MatchEvent, { type: "explode" }>;

  it("연출 끝 = 가장 늦은 이벤트 + 여운", () => {
    expect(playbackEnd(events)).toBeGreaterThanOrEqual(blast.t + EXPLOSION_TICKS + TAIL_TICKS);
  });

  it("탄 위치 = samples[틱 − 시작], 비행 밖이면 없음", () => {
    const mid = shot.t + 3;
    expect(shellsAt(events, mid)[0]).toMatchObject({ x: shot.samples[6], y: shot.samples[7] });
    expect(shellsAt(events, shot.t + shot.samples.length / 2)).toEqual([]);
  });

  it("폭발은 EXPLOSION_TICKS 동안만", () => {
    expect(blastsAt(events, blast.t)).toHaveLength(1);
    expect(blastsAt(events, blast.t + EXPLOSION_TICKS)).toHaveLength(0);
  });

  it("탱크 — 이동 path를 따라가고 끝나면 마지막 칸", () => {
    const me = state.tanks[state.turn.slot] as Tank;
    const move = events.find((e) => e.type === "move") as Extract<MatchEvent, { type: "move" }>;
    expect(tanksAt(state.tanks, events, 0).find((t) => t.slot === me.slot)).toMatchObject({ x: me.x });
    const end = tanksAt(state.tanks, events, 1000).find((t) => t.slot === me.slot);
    expect(end?.x).toBe(move.path[move.path.length - 2]);
  });

  it("폭발은 그 틱이 지나야 한 번씩", () => {
    expect(explosionsUntil(events, blast.t - 1, 0)).toEqual({ blasts: [], applied: 0 });
    const first = explosionsUntil(events, blast.t, 0);
    expect(first.blasts[0]).toEqual({ x: blast.x, y: blast.y, r: blast.r });
    // 같은 틱을 다시 물어도 중복 없음, 끝까지 가면 나머지 전부
    expect(explosionsUntil(events, blast.t, first.applied).blasts).toEqual([]);
    const rest = explosionsUntil(events, 1e9, first.applied);
    expect(first.applied + rest.blasts.length).toBe(events.filter((e) => e.type === "explode").length);
  });

  it("턴 시작 지형에 폭발을 순서대로 다시 파면 엔진의 다음 지형과 같다 (여러 번 터지는 무기 포함)", () => {
    let checked = 0;
    for (const tankId of [0, 1, 2]) {
      const c = createMatch({ ...config, seed: 40 + tankId, players: [{ slot: 0, team: 0, tankId }, { slot: 1, team: 0, tankId }] });
      if (!c.ok) throw new Error(c.reason);
      const s0: MatchState = c.state;
      for (const weaponId of [0, 1, 2, 3, 4, 5]) {
        for (const angle of [40, 75, 110, 140]) {
          const r = applyAction(s0, { kind: "fire", move: 0, angle, power: 55, weaponId });
          if (!r.ok) continue;
          let terrain: Terrain = s0.terrain;
          for (const b of explosionsUntil(r.events, 1e9, 0).blasts) terrain = carveCircle(terrain, b.x, b.y, b.r)?.terrain ?? terrain;
          expect(terrain.cols).toEqual(r.state.terrain.cols);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe("playbackEnd = eventsEndTick + 꼬리 (서버 마감과 같은 기준)", () => {
  /** eventsEndTick 도입 전 playbackEnd 그대로 — 바꾼 뒤에도 연출 길이가 한 틱도 달라지지 않아야 한다 */
  function frozenPlaybackEnd(events: readonly MatchEvent[]): number {
    let end = 0;
    for (const e of events) {
      if (e.type === "shot") end = Math.max(end, e.t + e.samples.length / 2 - 1);
      else if (e.type === "explode") end = Math.max(end, e.t + EXPLOSION_TICKS);
      else if (e.type === "fall") end = Math.max(end, e.t + FALL_TICKS);
      else if (e.type === "move") end = Math.max(end, Math.ceil((e.path.length / 2 - 1) / MOVE_PX_PER_TICK));
      else end = Math.max(end, e.t);
    }
    return end + TAIL_TICKS;
  }

  it("이동·무기 6종·각도·파워 조합에서 예전 값과 같고, 꼬리는 TAIL ~ TAIL + 폭발 보간", () => {
    let checked = 0;
    for (const mapId of ["hills", "canyon"] as const) {
      const created = createMatch({ seed: 9, mapId, mode: "ffa", players: [0, 1, 2].map((slot) => ({ slot, team: 0, tankId: slot })) });
      if (!created.ok) throw new Error(created.reason);
      const s = created.state;
      for (const weaponId of [0, 1, 2, 3, 4, 5]) {
        for (const angle of [30, 60, 90, 120, 150]) {
          for (const power of [0, 40, 80, 100]) {
            for (const move of [0, -31, 47]) {
              const r = applyAction(s, { kind: "fire", move, angle, power, weaponId });
              if (!r.ok) continue;
              const end = playbackEnd(r.events);
              expect(end).toBe(frozenPlaybackEnd(r.events));
              const tail = end - eventsEndTick(r.events);
              expect(tail).toBeGreaterThanOrEqual(TAIL_TICKS);
              expect(tail).toBeLessThanOrEqual(TAIL_TICKS + Math.max(EXPLOSION_TICKS, FALL_TICKS));
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("폭발 연출 크기", () => {
  it("화면에서 최소 크기 — 멀리 볼수록 월드 반지름을 키우고, 무기 크기 순서는 유지한다", () => {
    expect(blastDrawRadius(36, 1)).toBe(36);
    expect(blastDrawRadius(36, 0.4) * 0.4).toBeCloseTo(BLAST_MIN_PX);
    expect(blastDrawRadius(90, 0.4)).toBeGreaterThan(blastDrawRadius(36, 0.4));
    expect(blastDrawRadius(90, 2)).toBe(90);
  });
});

describe("탱크 스킨 그리기(drawTank)", () => {
  /** 칠한 색만 모으는 가짜 2D 컨텍스트 — 그리기 호출은 무시 */
  function recordingCtx() {
    const fills: string[] = [];
    const strokes: string[] = [];
    const target: Record<string | symbol, unknown> = {};
    const ctx = new Proxy(target, {
      get: (t, key) => (key in t ? t[key] : key === "createLinearGradient" ? () => ({ addColorStop: () => {} }) : () => {}),
      set: (t, key, value) => {
        if (key === "fillStyle" && typeof value === "string") fills.push(value);
        if (key === "strokeStyle" && typeof value === "string") strokes.push(value);
        t[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, fills, strokes };
  }
  const draw = (skin?: { id: "default" | "desert" | "arctic" | "neon"; level: number }) => {
    const r = recordingCtx();
    drawTank(r.ctx, 100, 100, "#38bdf8", 60, 1, 1.4, skin);
    return r;
  };

  it("기본은 지금 모양 그대로 — 장식(안테나·별) 없음, 몸통은 자리 색 그라데이션", () => {
    const { fills, strokes } = draw();
    expect(fills).not.toContain("#facc15");
    expect(strokes).not.toContain("#94a3b8");
    expect(fills).not.toContain("#0b1022");
  });
  it("스킨마다 무늬가 다르다 — 사막·설원은 두 색 얼룩, 네온은 어두운 차체에 자리 색 테두리", () => {
    expect(draw({ id: "desert", level: 1 }).fills).toEqual(expect.arrayContaining(["rgba(230, 200, 140, 0.85)", "rgba(110, 76, 40, 0.7)"]));
    expect(draw({ id: "arctic", level: 1 }).fills).toEqual(expect.arrayContaining(["rgba(248, 250, 252, 0.9)", "rgba(100, 116, 139, 0.6)"]));
    const neon = draw({ id: "neon", level: 1 });
    expect(neon.fills).toContain("#0b1022");
    expect(neon.strokes).toContain("#38bdf8");
  });
  it("레벨은 장식을 더한다 — Lv2 안테나 · Lv3 깃발(자리 색) · Lv5 금색 별", () => {
    expect(draw({ id: "default", level: 2 }).strokes).toContain("#94a3b8");
    expect(draw({ id: "default", level: 3 }).fills).toContain("#38bdf8");
    expect(draw({ id: "default", level: 4 }).fills).not.toContain("#facc15");
    expect(draw({ id: "default", level: 5 }).fills).toContain("#facc15");
  });
});

describe("화면 밖 탱크 칩 배치(offscreenChipLayout)", () => {
  const camera = { cx: 1500, cy: 600, zoom: 1 };
  const tank = (slot: number, x: number, y: number) => ({ slot, x, y, hp: 120, alive: true });
  const CHIP_H = 34;
  const COMPACT_H = 20;
  const STEP = CHIP_H + 12; // 칩 높이 + 간격(화살표가 이웃 칩을 침범하지 않게)
  const apart = (a: { cy: number }, b: { cy: number }) => Math.abs(a.cy - b.cy) >= STEP;

  // D-025 보충 5 메인 확인: 리플레이 390에서 화면 밖 적 칩이 가장자리의 화면 안 탱크를 덮었다
  it("칩이 가장자리의 화면 안 탱크(몸통·이름표)를 덮으면 위아래로 비켜 놓고, 자리가 없으면 반투명 — 시안", () => {
    const onX = camera.cx - view.width / 2 + 40; // 화면 왼쪽 끝 근처(화면 x 40)
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(0, onX, 600), tank(1, 900, 600)], look: "vivid" });
    const chip = chips.find((c) => c.slot === 1)!;
    const [, y] = worldToScreen(camera, view, onX, 600 - 9);
    const r = 9 * tankDrawScale(1, true);
    const boxTop = y - r * 1.4 - 28;
    const boxBottom = y + r * 0.9;
    const clear = chip.cy + CHIP_H / 2 <= boxTop || chip.cy - CHIP_H / 2 >= boxBottom;
    expect(clear || chip.faded === true).toBe(true);
  });
  // D-025 보충 6 메인 확인: 오른쪽 끝 화면 안 탱크와 같은 높이의 칩이 위로 비켰지만 이름표·HP 막대를 덮었다(상자가 실제 이름표보다 낮았다)
  it.each([0.6, 1, 1.4])("가장자리 탱크의 이름표·HP 막대(실제 그리는 자리)를 칩이 덮지 않는다 — zoom %s", (zoom) => {
    const cam = { cx: 1000, cy: 600, zoom };
    const onX = cam.cx + (view.width / 2 - 15) / zoom; // 화면 오른쪽 끝(x≈375)
    // 조작부 바로 위(아래로 비킬 자리가 없다) — 칩이 위로 비켜야 하는 장면
    const groundW = 600 + 85 / zoom;
    const chips = offscreenChipLayout({ camera: cam, view, tanks: [tank(1, onX, groundW), tank(0, onX + 300 / zoom, groundW)], look: "vivid", insetBottom: 200 });
    const chip = chips.find((c) => c.slot === 0)!;
    const scale = tankDrawScale(zoom, true);
    const [, labelY] = worldToScreen(cam, view, onX, groundW - 9 * scale * 2.2 - 6);
    const [, groundY] = worldToScreen(cam, view, onX, groundW);
    const labelTop = labelY - 22;
    const clear = chip.cy + CHIP_H / 2 <= labelTop || chip.cy - CHIP_H / 2 >= groundY;
    expect(clear || chip.faded === true).toBe(true);
  });
  it("classic(되돌리기 경로)은 예전 배치 그대로 — 비키지 않는다", () => {
    const onX = camera.cx - view.width / 2 + 40;
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(0, onX, 600), tank(1, 900, 600)], look: "classic" });
    const chip = chips.find((c) => c.slot === 1)!;
    expect(chip.cy).toBe(chip.ty);
    expect(chip.faded).toBeUndefined();
  });
  it("같은 쪽(왼쪽)에 화면 밖 탱크가 둘이면 세로로 쌓아 겹치지 않는다", () => {
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(1, 200, 610), tank(2, 260, 600), tank(0, 1500, 600)] });
    expect(chips.map((c) => c.slot).sort()).toEqual([1, 2]);
    expect(chips[0].cx).toBe(chips[1].cx);
    expect(apart(chips[0], chips[1])).toBe(true);
  });
  // D-025 보충 2 리뷰 확정: 터치 가로는 패드가 양끝에 겹친다 — 칩을 가장자리에 붙이면 십자 패드에 덮였다
  it("양옆이 가려지면(insetSide) 칩을 그 안쪽에 붙인다", () => {
    const side = 150;
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(1, 200, 610), tank(2, 2040, 600)], insetSide: side });
    const left = chips.find((c) => c.slot === 1)!;
    const right = chips.find((c) => c.slot === 2)!;
    expect(left.cx - 84 / 2).toBeGreaterThanOrEqual(side);
    expect(right.cx + 84 / 2).toBeLessThanOrEqual(view.width - side);
  });
  it("셋이어도 서로 겹치지 않고, 바닥에 닿으면 위로 쌓는다", () => {
    const low = 600 + view.height; // 화면 아래 — 칩이 바닥에 붙는다
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(1, 100, low), tank(2, 150, low), tank(3, 200, low)] });
    expect(chips).toHaveLength(3);
    for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) expect(apart(chips[i], chips[j])).toBe(true);
    for (const c of chips) expect(c.cy).toBeLessThanOrEqual(view.height - CHIP_H / 2 - 8);
  });
  it("아래 조작부(insetBottom)만큼 바닥이 올라가도 그 위에 쌓는다", () => {
    const low = 600 + view.height;
    const chips = offscreenChipLayout({ camera, view, insetBottom: 200, tanks: [tank(1, 100, low), tank(2, 150, low), tank(3, 200, low)] });
    for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) expect(apart(chips[i], chips[j])).toBe(true);
    for (const c of chips) expect(c.cy).toBeLessThanOrEqual(view.height - 200 - CHIP_H / 2 - 8);
  });
  it("두 줄 칩이 다 들어가지 않으면 그 묶음은 한 줄 칩으로 겹치지 않게 쌓는다(휴대폰 가로)", () => {
    // 812×375 가로 — 전장 319, 아래 조작부 오버레이 124
    const land = { width: 812, height: 319 };
    const low = 600 + land.height;
    const two = offscreenChipLayout({ camera, view: land, insetBottom: 124, tanks: [tank(1, 100, low), tank(2, 150, low)] });
    expect(two.every((c) => !c.compact)).toBe(true);
    expect(apart(two[0], two[1])).toBe(true);
    const three = offscreenChipLayout({ camera, view: land, insetBottom: 124, tanks: [tank(1, 100, low), tank(2, 150, low), tank(3, 200, low)] });
    expect(three.every((c) => c.compact)).toBe(true);
    const ys = three.map((c) => c.cy).sort((a, b) => a - b);
    expect(ys[0]).toBeGreaterThanOrEqual(88 + COMPACT_H / 2);
    expect(ys[2]).toBeLessThanOrEqual(land.height - 124 - COMPACT_H / 2 - 8);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(COMPACT_H + 12);
    // 다른 쪽 혼자인 칩은 두 줄 그대로
    const alone = offscreenChipLayout({ camera, view: land, insetBottom: 124, tanks: [tank(1, 100, low), tank(2, 150, low), tank(3, 200, low), tank(0, 2900, low)] });
    expect(alone.find((c) => c.slot === 0)?.compact).toBe(false);
  });
  it("한 줄 칩으로도 다 못 놓으면 위아래 사이에 고르게 나눈다(같은 자리에 겹쳐 두지 않는다)", () => {
    const short = { width: 390, height: 150 };
    const chips = offscreenChipLayout({ camera, view: short, tanks: [tank(1, 100, 2000), tank(2, 150, 2000), tank(3, 200, 2000)] });
    const ys = chips.map((c) => c.cy).sort((a, b) => a - b);
    expect(new Set(ys).size).toBe(3);
    expect(ys[0]).toBe(88 + COMPACT_H / 2);
    expect(ys[2]).toBe(150 - COMPACT_H / 2 - 8);
    expect(ys[1] - ys[0]).toBeCloseTo(ys[2] - ys[1]);
  });
  it("가로로 칩 너비보다 조금 더(간격 안) 떨어진 칩도 같은 쪽으로 묶어 쌓는다 — 방향 화살표가 옆 칩에 닿지 않게", () => {
    // 화면 위로 벗어난 두 탱크 — 칩 중심이 가로 90px 떨어짐(칩 너비 84 < 90 < 84 + 12)
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(1, 1405, 0), tank(2, 1495, 0)] });
    expect(chips[1].cx - chips[0].cx).toBe(90);
    expect(apart(chips[0], chips[1])).toBe(true);
  });
  it("서로 다른 쪽(왼쪽·오른쪽)이면 높이가 같아도 그대로 둔다", () => {
    const chips = offscreenChipLayout({ camera, view, tanks: [tank(1, 200, 600), tank(2, 2900, 600)] });
    expect(chips[0].cy).toBe(chips[1].cy);
  });
});
