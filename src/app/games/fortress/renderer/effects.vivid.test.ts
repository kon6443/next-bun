import { describe, expect, it } from "vitest";
import { type BlastStyle, VIVID_SHAKE, createEffects, hitJolt, spawnExplosionVivid, spawnWreckSmoke, updateEffects } from "./effects";
import { weaponFx } from "./vivid";

const style = (weaponId: number): BlastStyle => {
  const w = weaponFx(weaponId);
  return { kind: w.kind, fire: w.fire, debris: ["#62bd40", "#8e5d37"], dust: "#a8876a" };
};

describe("spawnExplosionVivid — 시안 폭발 (D-025 B)", () => {
  it("화면 흔들림은 무기 위력 순서 — 메가탄 > 대형탄 > 포탄 > 3연발", () => {
    const shakeOf = (id: number) => {
      const fx = createEffects();
      spawnExplosionVivid(fx, 500, 500, 36, style(id));
      return fx.shake;
    };
    expect(shakeOf(4)).toBeGreaterThan(shakeOf(2));
    expect(shakeOf(2)).toBeGreaterThan(shakeOf(0));
    expect(shakeOf(0)).toBeGreaterThan(shakeOf(1));
    expect(VIVID_SHAKE.mega).toBeGreaterThan(VIVID_SHAKE.heavy);
  });

  it("메가탄만 붉은 틴트, 움직임 줄이기면 흔들림·틴트·흰 섬광이 없다", () => {
    const fx = createEffects();
    spawnExplosionVivid(fx, 500, 500, 90, style(4));
    expect(fx.tint).toBe(1);
    expect(fx.particles.some((p) => p.kind === "glint")).toBe(true);
    const calm = createEffects();
    calm.reducedMotion = true;
    spawnExplosionVivid(calm, 500, 500, 90, style(4));
    expect(calm.shake).toBe(0);
    expect(calm.tint ?? 0).toBe(0);
    expect(calm.particles.some((p) => p.kind === "glint")).toBe(false);
  });

  it("품질이 낮으면 파편·불티가 줄어든다", () => {
    const high = createEffects();
    spawnExplosionVivid(high, 500, 500, 56, style(2));
    const low = createEffects();
    low.quality = "low";
    spawnExplosionVivid(low, 500, 500, 56, style(2));
    const count = (fx: typeof high, kind: string) => fx.particles.filter((p) => p.kind === kind).length;
    expect(count(low, "chunk")).toBeLessThan(count(high, "chunk"));
    expect(count(low, "spark")).toBeLessThan(count(high, "spark"));
  });

  it("흙·돌 조각은 땅에 떨어져 멈춘다(땅 아래로 빠지지 않는다)", () => {
    const fx = createEffects();
    fx.ground = () => 520;
    spawnExplosionVivid(fx, 500, 500, 36, style(0));
    const chunks = fx.particles.filter((p) => p.kind === "chunk");
    expect(chunks.length).toBeGreaterThan(0);
    const minLife = Math.min(...chunks.map((c) => c.max));
    for (let t = 0; t < minLife - 20; t += 16) {
      updateEffects(fx, 16, 0);
      for (const c of chunks) expect(c.y).toBeLessThanOrEqual(520);
    }
    expect(chunks.every((c) => c.rest)).toBe(true);
  });

  it("멈춘 조각도 다음 폭발로 발밑이 파이면 다시 떨어진다", () => {
    const fx = createEffects();
    let floor = 520;
    fx.ground = () => floor;
    spawnExplosionVivid(fx, 500, 500, 36, style(0));
    const chunks = fx.particles.filter((p) => p.kind === "chunk");
    for (let t = 0; t < 1300 && !chunks.every((c) => c.rest); t += 16) updateEffects(fx, 16, 0);
    const rested = chunks.filter((c) => c.rest);
    expect(rested.length).toBeGreaterThan(0);
    floor = 600;
    for (let t = 0; t < 120; t += 16) updateEffects(fx, 16, 0);
    for (const c of rested) expect(c.y).toBeGreaterThan(520);
  });

  it("피격 흔들림은 피해에 비례하고 상한이 있다", () => {
    expect(hitJolt(30)).toBeGreaterThan(hitJolt(10));
    expect(hitJolt(500)).toBe(8);
    expect(hitJolt(0)).toBeGreaterThan(0);
  });

  it("격파 잔해 연기는 위로 솟는 툰 연기 덩이(움직임 줄이기면 작게)", () => {
    const fx = createEffects();
    spawnWreckSmoke(fx, 100, 200);
    const p = fx.particles[0];
    expect(p.kind).toBe("puff");
    expect(p.vy).toBeLessThan(0);
    const calm = createEffects();
    calm.reducedMotion = true;
    spawnWreckSmoke(calm, 100, 200);
    expect(calm.particles[0].size).toBeLessThan(15);
  });
});
