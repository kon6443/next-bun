import type { MapId, MatchEvent } from "../engine";
import type { Aim } from "./drawScene";
import { type BlastStyle, type Effects, hitJolt, spawnExplosionVivid, spawnMuzzleBlast, spawnTrailSmoke, spawnWreckSmoke } from "./effects";
import { type TankView, firstShotIn } from "./playback";
import { type TankAnim, createTankAnim, stepTankAnim } from "./tankArt";
import { type WeaponFx, weaponFx } from "./vivid";
import { worldTheme } from "./vividWorld";

/** 시안 폭발 재료 — 파편·먼지는 맵 지면 색, 불은 무기 색 */
export function blastStyle(mapId: MapId, w: WeaponFx): BlastStyle {
  const g = worldTheme(mapId).ground;
  return { kind: w.kind, fire: w.fire, debris: [g.cap, g.capDark, g.bands[0], g.bands[2], g.pebble], dust: g.pebble };
}

/** 지금 연출 중인 행동 — 바뀌면(새 행동) 처음부터 센다 */
type AnimPlayback = { events: readonly MatchEvent[]; tick: number; shooter: number };

/**
 * 시안 탱크 연출(프레임마다) — 이 프레임까지 지난 이벤트(발사·피격·격파)를 반영하고, 궤도·포신·반동을 진행한다. 그리기 전용
 * 탱크별 상태는 anims(slot별), 어느 이벤트까지 반영했는지는 이 함수가 기억한다
 */
export function createTankAnimStepper(fx: Effects, anims: Map<number, TankAnim>) {
  let animPb: AnimPlayback | null = null;
  /** 탱크 연출이 이벤트를 어디까지 반영했나 — 같은 행동 안에서 틱이 지날 때만 */
  let animTick = -1;
  /** 이 행동의 발사 연출을 이미 했나(행동마다 한 번) */
  let animFired = false;
  return (
    pb: AnimPlayback | null,
    tanks: readonly TankView[],
    aim: Aim | null,
    dt: number,
    paused: boolean,
    opt: { mapId: MapId; barrelOf: (slot: number) => number; maxHpOf: (slot: number) => number },
  ): void => {
    if (pb !== animPb) {
      animPb = pb;
      animTick = -1;
      animFired = false;
    }
    if (pb) {
      // 발사 연출(반동·포구 연기·흔들림)은 행동마다 처음 탄 한 번 — 분열탄 자식탄·폭격 폭탄도 shot이라 공중에서 다시 나지 않게
      const e0 = firstShotIn(pb.events, animTick, pb.tick, animFired);
      if (e0) {
        animFired = true;
        const a = anims.get(pb.shooter);
        if (a) {
          // 반동 — 움직임 줄이기면 밀리지 않는다(포구 연기는 그대로)
          if (!fx.reducedMotion) a.recoil = 1;
          // 포구 연기·바닥 먼지 — 방향은 탄의 첫 두 표본
          const n = e0.samples.length;
          const dx = n >= 4 ? e0.samples[2] - e0.samples[0] : 1;
          const dy = n >= 4 ? e0.samples[3] - e0.samples[1] : 0;
          const len = Math.hypot(dx, dy) || 1;
          const shooter = tanks.find((x) => x.slot === pb.shooter);
          spawnMuzzleBlast(fx, e0.samples[0], e0.samples[1], dx / len, dy / len, shooter?.x ?? e0.samples[0], shooter?.y ?? e0.samples[1]);
          if (!fx.reducedMotion) fx.shake = Math.max(fx.shake, 2.5);
        }
      }
      for (const e of pb.events) {
        if (e.t <= animTick || e.t > pb.tick) continue;
        if (e.type === "damage") {
          const a = anims.get(e.slot);
          // 피격 — 흰 번쩍임 + 피해에 비례한 흔들림(움직임 줄이기면 둘 다 없다)
          if (a && !fx.reducedMotion) {
            a.flash = 1;
            a.jolt = Math.max(a.jolt, hitJolt(e.amount));
          }
        } else if (e.type === "death") {
          const t = tanks.find((x) => x.slot === e.slot);
          // 격파 폭발 — 시안에서만 돈다
          if (t) spawnExplosionVivid(fx, t.x, t.y - 10, 44, blastStyle(opt.mapId, weaponFx(2)));
        }
      }
      animTick = pb.tick;
    }
    for (const t of tanks) {
      let a = anims.get(t.slot);
      const target = aim && aim.slot === t.slot ? aim.angle : opt.barrelOf(t.slot);
      if (!a) {
        a = createTankAnim(t.x, target);
        if (!t.alive) a.wreck = 1;
        anims.set(t.slot, a);
      }
      stepTankAnim(a, t.x, target, t.alive, dt, fx.reducedMotion);
      // 충전 중 — 파워가 오를수록 조금씩 더 움찔(움직임 줄이기면 없다)
      if (aim?.charging && aim.slot === t.slot && !fx.reducedMotion) a.jolt = Math.max(a.jolt, 0.5 + aim.power * 0.014);
      // 많이 다친 탱크 — 검은 연기가 피어오른다
      const max = opt.maxHpOf(t.slot);
      // 일시정지 중에는 연기를 만들지 않는다 — 입자가 멈춰 있어 같은 자리에 쌓인다
      if (!paused && t.alive && max > 0 && t.hp / max < 0.35 && Math.random() < dt * 0.006) spawnTrailSmoke(fx, t.x + (Math.random() - 0.5) * 10, t.y - 18);
      // 격파된 잔해 — 툰 연기가 계속 피어오른다(초당 약 1.5덩이, 품질 low면 줄인다)
      if (!paused && !t.alive && Math.random() < dt * (fx.quality === "low" ? 0.0006 : 0.0015)) spawnWreckSmoke(fx, t.x, t.y - 6);
    }
  };
}
