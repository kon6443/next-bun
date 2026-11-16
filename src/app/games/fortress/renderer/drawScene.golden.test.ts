import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MapId } from "../engine";

/**
 * 그리기 기록 골든(리팩토링 안전망) — 정해진 장면을 가짜 2D 컨텍스트에 그려 모든 호출·스타일 설정을 순서대로 모으고 해시로 고정한다
 * 렌더러를 나누거나 정리해도(그림 변경 없음) 해시가 같아야 한다. 그림을 일부러 바꿨다면 새 해시로 갱신하고 그 이유를 커밋에 적는다
 */

/**
 * 숫자는 소수 둘째 자리까지 — Node(V8) 버전마다 Math.pow·sin 등의 마지막 자리가 달라(로컬 22 · CI 24) 그대로 해시하면 그림이 같아도 깨진다
 * 문자열 안의 실수(rgba(…, 0.4523) 같은 색)도 같은 이유로 반올림한다
 */
const fix = (n: number) => String(Math.round(n * 100) / 100 || 0);
const round = (v: unknown) =>
  typeof v === "number" ? fix(v) : typeof v === "string" ? v.replace(/-?\d+\.\d+(e-?\d+)?/g, (m) => fix(Number(m))) : typeof v === "object" && v && "__id" in v ? `#${(v as { __id: number }).__id}` : typeof v;

function recorder() {
  const log: string[] = [];
  let ids = 0;
  const obj = (name: string): Record<string, unknown> => {
    const id = ++ids;
    const target: Record<string | symbol, unknown> = { __id: id };
    return new Proxy(target, {
      get: (t, key) => {
        if (key in t) return t[key];
        if (typeof key === "symbol") return undefined;
        if (key === "canvas") return fakeCanvas();
        return (...args: unknown[]) => {
          log.push(`${name}${id}.${key}(${args.map(round).join(",")})`);
          if (key === "measureText") return { width: String(args[0]).length * 7 };
          if (key.startsWith("create")) return obj(key.replace("create", ""));
          if (key === "getImageData") return { data: new Uint8ClampedArray(4 * Math.max(1, Number(args[2]) * Number(args[3]))) };
          return undefined;
        };
      },
      set: (t, key, value) => {
        log.push(`${name}${id}.${String(key)}=${round(value)}`);
        t[key] = value;
        return true;
      },
    });
  };
  const fakeCanvas = (): Record<string, unknown> => {
    const c: Record<string, unknown> = { width: 0, height: 0, style: {} };
    let ctx: Record<string, unknown> | null = null;
    c.getContext = () => (ctx ??= obj("off"));
    return c;
  };
  return { log, ctx: obj("ctx") as unknown as CanvasRenderingContext2D, fakeCanvas, path2d: () => obj("path") };
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

async function drawLog(mapId: MapId, quality: "high" | "low" = "high") {
  // 렌더러 모듈 캐시(하늘·땅 타일·음영)가 앞 장면의 영향을 주지 않게 매번 새로 불러온다
  vi.resetModules();
  const { generateTerrain } = await import("../engine/maps");
  const { drawScene } = await import("./drawScene");
  const { createEffects, spawnExplosionVivid, spawnMuzzleBlast, updateEffects } = await import("./effects");
  const { createTankAnim } = await import("./tankArt");
  const { weaponFx } = await import("./vivid");
  const { createTerrainLayer, paintAll } = await import("./terrainLayer");
  const r = recorder();
  vi.stubGlobal("document", { createElement: () => r.fakeCanvas() });
  vi.stubGlobal(
    "Path2D",
    class {
      constructor() {
        return r.path2d();
      }
    },
  );
  let seed = 7;
  vi.spyOn(Math, "random").mockImplementation(() => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646);
  const terrain = generateTerrain(mapId, 3);
  const layer = createTerrainLayer({ mapId });
  if (layer) paintAll(layer, terrain);
  const fx = createEffects();
  const w = weaponFx(1);
  spawnExplosionVivid(fx, 700, 420, 30, { kind: w.kind, fire: w.fire, debris: ["#62bd40", "#8e5d37"], dust: "#a8876a" });
  spawnMuzzleBlast(fx, 400, 380, 1, -1, 0, 0);
  updateEffects(fx, 120, 2);
  const anims = [createTankAnim(400, 55), createTankAnim(900, 125), createTankAnim(1500, 90)];
  drawScene(r.ctx, {
    camera: { cx: 800, cy: 420, zoom: 0.9 },
    view: { width: 390, height: 520 },
    layer,
    tanks: [
      { slot: 0, x: 400, y: 400, hp: 80, alive: true },
      { slot: 1, x: 900, y: 430, hp: 20, alive: true },
      { slot: 2, x: 1500, y: 380, hp: 0, alive: false },
    ],
    colorOf: (slot) => ["#38bdf8", "#f97316", "#a3e635"][slot],
    skinOf: (slot) => [{ id: "default", level: 1 }, { id: "neon", level: 5 }, { id: "desert", level: 3 }][slot] as never,
    labelOf: (slot) => `P${slot + 1}`,
    maxHpOf: () => 100,
    barrelOf: (slot) => [55, 125, 90][slot],
    activeSlot: 0,
    aim: { slot: 0, x: 400, y: 400, angle: 55, power: 60, path: [400, 390, 450, 350, 500, 330] } as never,
    shells: [{ id: 1, x: 600, y: 300, trail: [560, 320, 580, 310] }],
    blasts: [{ x: 700, y: 420, r: 30, progress: 0.4 }],
    popups: [{ slot: 1, amount: 25, progress: 0.3 }],
    outs: [{ x: 2600, y: 200 }],
    insetBottom: 60,
    time: 1234,
    wind: 3,
    quality,
    reducedMotion: quality === "low",
    fx,
    mapId,
    weaponId: 1,
    activeSince: 1000,
    tankAnimOf: (slot) => anims[slot],
  });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  return r.log;
}

describe("drawScene 그리기 기록 골든", () => {
  beforeAll(() => vi.useFakeTimers());
  afterAll(() => vi.useRealTimers());

  // 그림은 vivid 하나(glow는 같은 캔버스 위 WebGL 후처리) — 맵 둘 + 저화질·움직임 줄이기 장면을 고정
  it.each<[MapId, "high" | "low"]>([
    ["hills", "high"],
    ["canyon", "high"],
    ["canyon", "low"],
  ])("%s · %s", async (mapId, quality) => {
    const log = await drawLog(mapId, quality);
    expect(log.length).toBeGreaterThan(500);
    expect(`${log.length}:${fnv(log.join("\n"))}`).toMatchSnapshot();
  });

  it("같은 장면은 같은 기록(결정적)", async () => {
    expect(await drawLog("hills")).toEqual(await drawLog("hills"));
  });
});
