import { describe, expect, it } from "vitest";
import { chooseTurn } from "../ai/chooseTurn";
import { type MatchEvent, type MatchState, type Tank, WORLD_WIDTH, applyAction, createMatch, fnv1a } from "../engine";
import { type Camera, approachLimited, clampCamera, worldToScreen } from "./camera";
import { FLIGHT_MOTION, type FlightPlan, TURN_MOTION, flightBegin, flightStep, flightTarget, followPlan, isRising, planFlight, readyToFly, shellsOffscreen } from "./follow";
import { playbackEnd, shellsAt } from "./playback";

const DT = 1000 / 60;
const HUD = 84;
type View = { name: string; view: { width: number; height: number }; bottomPx: number };
/** 실측 전장(캔버스) 크기 + 조작부 오버레이 높이 — 휴대폰 세로·가로·데스크톱 */
const VIEWS: View[] = [
  { name: "390×844", view: { width: 390, height: 497 }, bottomPx: 0 },
  { name: "812×375", view: { width: 812, height: 331 }, bottomPx: 136 },
  { name: "1280×800", view: { width: 1280, height: 748 }, bottomPx: 152 },
];
type Shot = { name: string; tankId: number; weaponId: number; angle: number; power: number };
const SHOTS: Shot[] = [
  { name: "최대 파워", tankId: 0, weaponId: 0, angle: 45, power: 100 },
  { name: "중간 파워", tankId: 0, weaponId: 0, angle: 50, power: 70 },
  { name: "분열탄", tankId: 1, weaponId: 3, angle: 50, power: 80 },
  { name: "폭격", tankId: 2, weaponId: 5, angle: 30, power: 100 },
  { name: "높이 쏘기", tankId: 0, weaponId: 0, angle: 82, power: 100 },
];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function fire(shot: Shot, seed: number, mapId: "hills" | "canyon" = "hills"): { s: MatchState; events: MatchEvent[] } {
  const r = createMatch({ seed, mapId, mode: "ffa", players: [{ slot: 0, team: 0, tankId: shot.tankId }, { slot: 1, team: 0, tankId: shot.tankId }] });
  if (!r.ok) throw new Error(r.reason);
  const s = r.state;
  const me = s.tanks[s.turn.slot]!;
  const enemy = s.tanks[1 - s.turn.slot]!;
  const a = applyAction(s, { kind: "fire", move: 0, angle: enemy.x > me.x ? shot.angle : 180 - shot.angle, power: shot.power, weaponId: shot.weaponId });
  if (!a.ok) throw new Error(a.reason);
  return { s, events: a.events };
}

type Frame = { camera: Camera; target: Camera; shells: ReturnType<typeof shellsAt>; view: View["view"]; plan: FlightPlan };

/**
 * 비행 한 번 — 훅(useBattleView)과 같은 순서: 계획 → 시작(미리 돌려 보고 놓치면 컷) → 프레임마다 목표·차분한 추종(flightStep)
 * 프레임 간격(frameMs): 60fps는 틱마다 두 프레임, 120Hz는 네 프레임, 240Hz는 여덟 프레임, 30fps는 한 프레임. 연출 첫 프레임은 시계가 흐르지 않아 첫 틱에 한 프레임 더(훅과 같은 위상)
 * resizeAt: 그 프레임에 화면이 바뀌면(회전) 다시 계획하고 지난 목표에서 이어 간다
 */
function fly(events: MatchEvent[], v: View, camera: Camera, opts: { reduced?: boolean; frameMs?: number; resizeAt?: { frame: number; to: View }; recenterAt?: { frame: number; from: Camera } } = {}) {
  const frameMs = opts.frameMs ?? DT;
  const perTick = Math.max(1, Math.round(1000 / 30 / frameMs));
  let view = v.view;
  let bottomPx = v.bottomPx;
  let plan = planFlight(events, view, { hudTop: HUD, bottomPx }, opts.reduced ?? false)!;
  const begin = flightBegin(plan, events, camera, view, { reducedMotion: opts.reduced });
  let cam = begin.cut ?? camera;
  let prev = begin.prev;
  const frames: Frame[] = [];
  const end = playbackEnd(events);
  for (let tick = 0; tick <= end; tick++) {
    const shells = shellsAt(events, tick);
    if (shells.length === 0) continue;
    for (let k = tick === 0 ? -1 : 0; k < perTick; k++) {
      if (opts.resizeAt && frames.length === opts.resizeAt.frame) {
        view = opts.resizeAt.to.view;
        bottomPx = opts.resizeAt.to.bottomPx;
        cam = clampCamera(cam, view, { bottomPx });
        plan = planFlight(events, view, { hudTop: HUD, bottomPx }, opts.reduced ?? false)!;
        const again = flightBegin(plan, events, cam, view, { reducedMotion: opts.reduced, resume: prev, fromTick: tick });
        if (again.cut) cam = again.cut;
        prev = again.prev;
      }
      // "내 탱크로" — 둘러보던 자리(from)에서 추적을 다시 켜면 지금 틱부터 다시 계획(훅의 resumeFlightRef)
      if (opts.recenterAt && frames.length === opts.recenterAt.frame) {
        cam = clampCamera(opts.recenterAt.from, view, { bottomPx });
        const again = flightBegin(plan, events, cam, view, { reducedMotion: opts.reduced, resume: prev, fromTick: tick });
        if (again.cut) cam = again.cut;
        prev = again.prev;
      }
      const target = flightTarget(plan, shells, prev);
      prev = target;
      cam = flightStep(plan, cam, view, target, frameMs);
      frames.push({ camera: cam, target, shells, view, plan });
    }
  }
  return { plan, cut: begin.cut !== null, frames, camera: cam };
}

type Start = "aim" | "zoom09" | "zoom25" | "arrival";
/** 발사 순간 카메라 — aim 조준 화면에 자리 잡음 · zoom09 탱크 위 0.9(첫 턴·show 직후) · zoom25 핀치로 2.5까지 · arrival 도착 쪽(앞 착탄 자리)에 자리 잡음 */
function startCamera(s: MatchState, v: View, start: Start): Camera {
  const me = s.tanks[s.turn.slot]!;
  const enemy = s.tanks[1 - s.turn.slot]!;
  const at = start === "arrival" ? enemy : me;
  let camera = clampCamera({ cx: at.x, cy: at.y - 120, zoom: start === "zoom25" ? 2.5 : 0.9 }, v.view, { bottomPx: v.bottomPx });
  if (start === "aim" || start === "arrival")
    for (let f = 0; f < 240; f++) {
      const p = followPlan({ view: v.view, me: at, enemy: start === "arrival" ? me : enemy, hudTop: HUD, bottomPx: v.bottomPx })!;
      camera = approachLimited(camera, v.view, p.target, TURN_MOTION, DT, p.bounds);
    }
  return camera;
}

function offscreenFrames(frames: Frame[]): number {
  return frames.filter((f) => shellsOffscreen(f.plan, f.camera, f.view, f.shells)).length;
}

/** 부호가 바뀐 횟수 — 화면에서 1px 미만 움직임은 세지 않는다(보이지 않는 흔들림) */
function reversals(frames: Frame[], axis: "cx" | "cy"): number {
  let prev = 0;
  let count = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = (frames[i].camera[axis] - frames[i - 1].camera[axis]) * frames[i].camera.zoom;
    const s = Math.abs(d) < 1 ? 0 : Math.sign(d);
    if (s && prev && s !== prev) count++;
    if (s) prev = s;
  }
  return count;
}

function zoomReversals(frames: Frame[]): number {
  let prev = 0;
  let count = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = Math.log(frames[i].camera.zoom / frames[i - 1].camera.zoom);
    const s = Math.abs(d) < 1e-4 ? 0 : Math.sign(d);
    if (s && prev && s !== prev) count++;
    if (s) prev = s;
  }
  return count;
}

// 시나리오가 많은 묶음(수천 발 모의) — 기본 5초는 부하가 걸리면 넘친다
describe("탄 추적 카메라 (D-024) — 비행 계획은 발사 순간 한 번", { timeout: 30_000 }, () => {
  for (const v of VIEWS)
    it(`${v.name} — 무기 5종 × seed 12 × 시작 4가지: 탄을 놓치지 않고, 줌 목표 하나·줌 왕복 0·가로 되돌아감 ≤1·세로 왕복 ≤1`, () => {
      for (const shot of SHOTS)
        for (const seed of SEEDS)
          for (const start of ["aim", "zoom09", "zoom25", "arrival"] as const) {
            const { s, events } = fire(shot, seed);
            const { cut, frames } = fly(events, v, startCamera(s, v, start));
            const at = `${shot.name} seed ${seed} ${start}`;
            expect(frames.length, at).toBeGreaterThan(0);
            expect(offscreenFrames(frames), at).toBe(0);
            expect(new Set(frames.map((f) => f.target.zoom)).size, at).toBe(1);
            expect(zoomReversals(frames), at).toBe(0);
            // 가로는 진행 방향으로만 — 지금 자리에서 부드럽게 시작했으면 출발점 쪽으로 한 번 돌아올 수 있다(컷이면 0)
            expect(reversals(frames, "cx"), at).toBeLessThanOrEqual(cut ? 0 : 1);
            expect(reversals(frames, "cy"), at).toBeLessThanOrEqual(1);
            for (let i = 1; i < frames.length; i++) {
              const a = frames[i - 1].camera;
              const b = frames[i].camera;
              expect(Math.hypot(b.cx - a.cx, b.cy - a.cy) * Math.max(a.zoom, b.zoom), at).toBeLessThanOrEqual(FLIGHT_MOTION.maxPx * Math.SQRT2 + 1e-6);
            }
          }
    });

  it("조준 화면에서 쏜 보통 발(seed 7)은 컷 없이 지금 자리에서 부드럽게 — 가로 되돌아감 0, 세로 왕복 0(세로가 넘치는 화면 제외)", () => {
    for (const v of VIEWS)
      for (const shot of SHOTS) {
        const { s, events } = fire(shot, 7);
        const { plan, cut, frames } = fly(events, v, startCamera(s, v, "aim"));
        expect(cut, `${v.name} ${shot.name}`).toBe(false);
        expect(reversals(frames, "cx"), `${v.name} ${shot.name}`).toBe(0);
        if (!plan.trackY) expect(reversals(frames, "cy"), `${v.name} ${shot.name}`).toBe(0);
      }
  });

  // 리뷰 확정(D-024 2차 D5): 리플레이는 연출이 끝나면 곧바로 다음 발 — 턴 전환 없이 앞 착탄 자리에서 시작해도 놓치지 않는다(필요하면 처음에 한 번 컷)
  it("리플레이 연속 턴(2~4인 개인전·hills·canyon, 턴 사이 1프레임) — 어느 발도 탄을 놓치지 않고, 반전·줌 왕복 제한을 지킨다", () => {
    for (const v of VIEWS)
      for (const n of [2, 3, 4])
        for (const [seed, mapId] of [[1014, "hills"], [2, "hills"], [9, "canyon"], [1013, "canyon"]] as const) {
          const r = createMatch({ seed, mapId, mode: "ffa", players: Array.from({ length: n }, (_, slot) => ({ slot, team: 0, tankId: slot % 3 })) });
          if (!r.ok) throw new Error(r.reason);
          let s = r.state;
          const first = s.tanks[s.turn.slot] as Tank;
          let camera = clampCamera({ cx: first.x, cy: first.y - 120, zoom: 0.9 }, v.view, { bottomPx: v.bottomPx });
          for (let turn = 0; turn < 10 && s.result.kind === "ongoing"; turn++) {
            const a = applyAction(s, chooseTurn(s, s.turn.slot, 0, fnv1a([seed, s.turn.no])));
            if (!a.ok) break;
            if (a.events.some((e) => e.type === "shot")) {
              const flown = fly(a.events, v, camera);
              const at = `${v.name} ${n}인 ${mapId} seed ${seed} 턴 ${turn}`;
              expect(offscreenFrames(flown.frames), at).toBe(0);
              expect(reversals(flown.frames, "cx"), at).toBeLessThanOrEqual(flown.cut ? 0 : 1);
              expect(reversals(flown.frames, "cy"), at).toBeLessThanOrEqual(1);
              expect(zoomReversals(flown.frames), at).toBe(0);
              camera = flown.camera;
            }
            s = a.state;
          }
        }
  });

  // 리뷰 확정(D-024 3차): 비행 후반에 회전해 다시 계획하다 컷하면 비행 시작 자리로 돌아가 탄을 놓쳤다 — 컷은 지금 앞선 탄 자리로
  // 리뷰 확정(D-024 3차 D8·D10): 앞 턴 뒤 카메라가 다음 사수 쪽으로 덜 간 채(AI 450ms·리플레이) 쏘는 여러 판 — 미리 돌려 보기 위상이 훅과 같아야 잘리지 않고, 줌을 빼는 동안 세로가 출렁이지 않는다
  it("여러 판 연속(2~4인·hills·canyon·seed 300~315, 다음 발 전 0·12·24프레임 이동) — 탄을 놓치지 않고 세로 왕복 ≤1", () => {
    for (const v of [VIEWS[0], VIEWS[1]])
      for (const n of [2, 3, 4])
        for (const mapId of ["hills", "canyon"] as const)
          for (let seed = 300; seed <= 315; seed++) {
            const r = createMatch({ seed, mapId, mode: "ffa", players: Array.from({ length: n }, (_, slot) => ({ slot, team: 0, tankId: (slot + seed) % 3 })) });
            if (!r.ok) throw new Error(r.reason);
            let s = r.state;
            const first = s.tanks[s.turn.slot] as Tank;
            let camera = clampCamera({ cx: first.x, cy: first.y - 120, zoom: 0.9 }, v.view, { bottomPx: v.bottomPx });
            const settle = [0, 12, 24][seed % 3];
            for (let turn = 0; turn < 8 && s.result.kind === "ongoing"; turn++) {
              const shooter = s.tanks[s.turn.slot] as Tank;
              for (let f = 0; f < settle; f++) {
                const p = followPlan({ view: v.view, me: shooter, enemy: null, hudTop: HUD, bottomPx: v.bottomPx })!;
                camera = approachLimited(camera, v.view, p.target, TURN_MOTION, DT, p.bounds);
              }
              const a = applyAction(s, chooseTurn(s, s.turn.slot, 0, fnv1a([seed, s.turn.no])));
              if (!a.ok) break;
              if (a.events.some((e) => e.type === "shot")) {
                const flown = fly(a.events, v, camera);
                const at = `${v.name} ${n}인 ${mapId} seed ${seed} 턴 ${turn} settle ${settle}`;
                expect(offscreenFrames(flown.frames), at).toBe(0);
                expect(reversals(flown.frames, "cy"), at).toBeLessThanOrEqual(1);
                camera = flown.camera;
              }
              s = a.state;
            }
          }
  });

  it("비행 중 회전(세로 ↔ 가로, 비행의 1~85% 시점) — 다시 계획하고 지난 자리에서 이어 가며 탄을 놓치지 않는다", () => {
    for (const shot of SHOTS)
      for (const seed of [1, 4, 7])
        for (const [from, to] of [
          [VIEWS[0], VIEWS[1]],
          [VIEWS[1], VIEWS[0]],
          [VIEWS[2], VIEWS[0]],
          [VIEWS[0], VIEWS[2]],
        ]) {
          const { s, events } = fire(shot, seed);
          const total = fly(events, from, startCamera(s, from, "aim")).frames.length;
          for (const at of [0.01, 0.05, 0.1, 0.15, 0.3, 0.5, 0.7, 0.85]) {
            const frame = Math.floor(total * at);
            const { frames } = fly(events, from, startCamera(s, from, "aim"), { resizeAt: { frame, to } });
            expect(offscreenFrames(frames.slice(frame + 1)), `${shot.name} seed ${seed} ${from.name}→${to.name} ${at * 100}%`).toBe(0);
          }
        }
  });

  // 리뷰 확정(D-024 3차 D8): 미리 돌려 보기는 60fps 가정 — 조준 화면·0.9배·도착 쪽에서 쏜 발은 120Hz·30fps에서도 가장자리에서 잘리지 않는다(판정에 여유는 두지 않는다 — follow.ts missesAnyShell)
  it("프레임 간격이 달라도(120Hz·30fps) 탄을 놓치지 않는다", () => {
    for (const v of VIEWS)
      for (const shot of SHOTS)
        for (const seed of [1, 4, 7, 10])
          for (const start of ["aim", "zoom09", "arrival"] as const)
            for (const frameMs of [1000 / 120, 1000 / 30]) {
              const { s, events } = fire(shot, seed);
              expect(offscreenFrames(fly(events, v, startCamera(s, v, start), { frameMs }).frames), `${v.name} ${shot.name} seed ${seed} ${start} ${Math.round(1000 / frameMs)}Hz`).toBe(0);
            }
  });

  // 리뷰 확정(D-024 5차 D1·6차 E1 144Hz 이상): AI·리플레이의 기다림은 처음 '준비'된 순간(판정 경계)에 쏜다 — 60fps만 보고 준비로 치면 120Hz(첫 프레임 이동이 절반)·30fps에서 포구의 탄이 가장자리 밖에 남았다
  it("쏘기 전 기다림(readyToFly)이 준비라고 한 자리에서 쏘면 30fps·60·120·240Hz 모두 컷 없이 탄을 놓치지 않는다(리플레이 연속 턴·2~4인·hills·canyon)", () => {
    let waitedShots = 0;
    for (const v of VIEWS)
      for (const n of [2, 3, 4])
        for (const mapId of ["hills", "canyon"] as const)
          for (let seed = 1; seed <= 8; seed++) {
            const r = createMatch({ seed, mapId, mode: "ffa", players: Array.from({ length: n }, (_, slot) => ({ slot, team: 0, tankId: (slot + seed) % 3 })) });
            if (!r.ok) throw new Error(r.reason);
            let s = r.state;
            const first = s.tanks[s.turn.slot] as Tank;
            let camera = clampCamera({ cx: first.x, cy: first.y - 120, zoom: 0.9 }, v.view, { bottomPx: v.bottomPx });
            for (let turn = 0; turn < 8 && s.result.kind === "ongoing"; turn++) {
              const a = applyAction(s, chooseTurn(s, s.turn.slot, 0, fnv1a([seed, s.turn.no])));
              if (!a.ok) break;
              const plan = planFlight(a.events, v.view, { hudTop: HUD, bottomPx: v.bottomPx }, false);
              if (plan) {
                // 기다림 — 다음 사수 쪽으로 천천히 가며 처음 준비된 프레임에 쏜다(최대 1초 = 60프레임)
                const shooter = s.tanks[s.turn.slot] as Tank;
                let f = 0;
                for (; f < 60 && !readyToFly(plan, a.events, camera, v.view); f++) {
                  const p = followPlan({ view: v.view, me: shooter, enemy: null, hudTop: HUD, bottomPx: v.bottomPx })!;
                  camera = approachLimited(camera, v.view, p.target, TURN_MOTION, DT, p.bounds);
                }
                const ready = readyToFly(plan, a.events, camera, v.view);
                if (ready && f > 0) waitedShots++;
                // 이 하네스(fly)는 틱마다 정수 프레임이라 30·60·120·240Hz만 실제 시간과 같다 — 그 사이 주사율(48~200Hz)은 실제 시계를 흉내 낸 별도 측정으로 확인(D-024 6차)
                // 준비면 네 주사율 모두 컷 없이 놓치지 않는다. 상한(1초)까지 준비가 안 되면 시작 판정(60fps)에 맡긴다 — 그 경우는 기다림과 무관한 기존 동작이라 60fps만 본다
                for (const frameMs of ready ? [1000 / 30, DT, 1000 / 120, 1000 / 240] : [DT]) {
                  const flown = fly(a.events, v, camera, { frameMs });
                  const at = `${v.name} ${n}인 ${mapId} seed ${seed} 턴 ${turn} ${Math.round(1000 / frameMs)}Hz 기다림 ${f}프레임`;
                  if (ready) expect(flown.cut, at).toBe(false);
                  expect(offscreenFrames(flown.frames), at).toBe(0);
                }
                camera = fly(a.events, v, camera).camera;
              }
              s = a.state;
            }
          }
    expect(waitedShots).toBeGreaterThan(20);
  });

  // 리뷰 확정(D-024 3차 D9·4차): 둘러보다 비행 중 "내 탱크로"를 누르면 지금 틱부터 다시 계획 — 멀리(2.5배·맵 끝·하늘·땅속) 있던 카메라도 탄을 놓치지 않는다
  it("비행 중 \"내 탱크로\"(둘러보던 먼 자리에서 다시 켬) — 다시 계획하고 탄을 놓치지 않는다", () => {
    const far: Camera[] = [
      { cx: 0, cy: 600, zoom: 2.5 },
      { cx: 2048, cy: 600, zoom: 2.5 },
      { cx: 1024, cy: -2000, zoom: 1 },
      { cx: 1024, cy: 3000, zoom: 1 },
    ];
    for (const v of VIEWS)
      for (const shot of SHOTS)
        for (const seed of [1, 4, 7])
          for (const from of far) {
            const { s, events } = fire(shot, seed);
            const total = fly(events, v, startCamera(s, v, "aim")).frames.length;
            for (const at of [0.1, 0.4, 0.7]) {
              const frame = Math.floor(total * at);
              const { frames } = fly(events, v, startCamera(s, v, "aim"), { recenterAt: { frame, from } });
              expect(offscreenFrames(frames.slice(frame)), `${v.name} ${shot.name} seed ${seed} ${at * 100}% ${JSON.stringify(from)}`).toBe(0);
            }
          }
  });

  it("앞선 탄이 뒤로 바뀌어도(분열·폭격의 앞선 탄이 터짐) 가로 목표는 되돌아가지 않는다", () => {
    const { events } = fire(SHOTS[0], 7);
    const plan = planFlight(events, VIEWS[0].view, { hudTop: HUD, bottomPx: 0 }, false)!;
    expect(plan.track).toBe(true);
    const ahead = plan.dir > 0 ? Math.max(plan.cxFrom, plan.cxTo) : Math.min(plan.cxFrom, plan.cxTo);
    const shell = (x: number) => ({ id: 0, x, y: 300, trail: [x, 310, x, 300] });
    const t1 = flightTarget(plan, [shell(ahead)], { cx: plan.cxFrom, cy: plan.cy });
    const t2 = flightTarget(plan, [shell(plan.cxFrom - plan.dir * 200)], t1);
    expect(t2.cx).toBe(t1.cx);
  });

  it("세로가 넘치는 화면 — 위로는 솟는 탄만, 아래로는 떨어지는 탄만 따라간다(갓 생긴 폭격탄·포구의 첫 틱으로는 움직이지 않는다)", () => {
    const { events } = fire(SHOTS[4], 7);
    const plan = planFlight(events, VIEWS[1].view, { hudTop: HUD, bottomPx: VIEWS[1].bottomPx }, false)!;
    expect(plan.trackY).toBe(true);
    const prev = { cx: plan.cxFrom, cy: 600 };
    const at = (y: number, trail: number[]) => flightTarget(plan, [{ id: 0, x: plan.cxFrom, y, trail }], prev).cy;
    expect(at(-400, [plan.cxFrom, -400])).toBe(600);
    expect(at(1500, [plan.cxFrom, 1500])).toBe(600);
    expect(at(-400, [plan.cxFrom, -380, plan.cxFrom, -400])).toBeLessThan(600);
    expect(at(1500, [plan.cxFrom, 1480, plan.cxFrom, 1500])).toBeGreaterThan(600);
    expect(isRising({ id: 0, x: 0, y: 0, trail: [0, 0] })).toBe(false);
  });

  it("움직임 줄이기 — 늘 처음에 컷하고 비행 내내 목표가 한 자리", () => {
    for (const v of VIEWS) {
      const { s, events } = fire(SHOTS[0], 7);
      const { plan, cut, frames } = fly(events, v, startCamera(s, v, "aim"), { reduced: true });
      expect(cut).toBe(true);
      expect(plan.track).toBe(false);
      expect(plan.trackY).toBe(false);
      expect(new Set(frames.map((f) => `${f.target.cx},${f.target.cy},${f.target.zoom}`)).size).toBe(1);
    }
  });

  it("탄이 없는 행동(기권)은 비행 계획 없음", () => {
    expect(planFlight([{ type: "death", t: 0, slot: 0, cause: "resign" }], VIEWS[0].view, { hudTop: HUD, bottomPx: 0 }, false)).toBeNull();
  });
});

describe("카메라 이동 상한·턴 화면", () => {
  it("approachLimited — 목표가 멀어도 한 프레임에 화면 maxPx·배율 (1+maxZoomStep)배까지만(확대하며 움직여도)", () => {
    const view = { width: 390, height: 497 };
    const from: Camera = { cx: 600, cy: 600, zoom: 0.6 };
    for (const to of [{ cx: 1800, cy: 300, zoom: 0.3 }, { cx: 1800, cy: 300, zoom: 1.5 }]) {
      const next = approachLimited(from, view, to, TURN_MOTION, DT);
      const z = Math.max(from.zoom, next.zoom);
      expect(Math.abs(next.cx - from.cx) * z).toBeLessThanOrEqual(TURN_MOTION.maxPx + 1e-6);
      expect(Math.abs(next.cy - from.cy) * z).toBeLessThanOrEqual(TURN_MOTION.maxPx + 1e-6);
      expect(Math.max(from.zoom / next.zoom, next.zoom / from.zoom)).toBeLessThanOrEqual(1 + TURN_MOTION.maxZoomStep + 1e-9);
    }
  });

  it("120Hz 두 프레임은 60Hz 한 프레임과 같은 만큼 다가간다(상한에 걸리지 않을 때)", () => {
    const view = { width: 1280, height: 748 };
    const from: Camera = { cx: 1000, cy: 600, zoom: 0.6 };
    const target: Camera = { cx: 1010, cy: 604, zoom: 0.58 };
    const one = approachLimited(from, view, target, FLIGHT_MOTION, 1000 / 60);
    const two = approachLimited(approachLimited(from, view, target, FLIGHT_MOTION, 1000 / 120), view, target, FLIGHT_MOTION, 1000 / 120);
    expect(two.cx).toBeCloseTo(one.cx, 6);
    expect(two.cy).toBeCloseTo(one.cy, 6);
    expect(two.zoom).toBeCloseTo(one.zoom, 6);
  });

  // D-025 보충 2: 터치 가로는 패드가 전장 위 양끝에 겹친다 — 조준 화면·비행 계획이 그 안쪽에 담는다
  it("양옆이 패드에 가려지면(sidePx) 내 탱크·가까운 적·비행 경로를 그 안쪽에 담는다(없으면 예전과 같다)", () => {
    const view = { width: 812, height: 331 };
    const side = 150;
    const me = { x: 900, y: 600 };
    const enemy = { x: 1250, y: 620 };
    const p = followPlan({ view, me, enemy, hudTop: HUD, bottomPx: 70, sidePx: side })!;
    const c = approachLimited(p.target, view, p.target, TURN_MOTION, DT, p.bounds);
    for (const t of [me, enemy]) {
      const [x] = worldToScreen(c, view, t.x, t.y);
      expect(x).toBeGreaterThanOrEqual(side);
      expect(x).toBeLessThanOrEqual(view.width - side);
    }
    expect(followPlan({ view, me, enemy, hudTop: HUD, bottomPx: 70, sidePx: 0 })!.target).toEqual(followPlan({ view, me, enemy, hudTop: HUD, bottomPx: 70 })!.target);
    // 비행 — 고정 화면이면 경로 전체가 양옆 가림 안쪽
    const { events } = fire(SHOTS[1], 1);
    const plan = planFlight(events, view, { hudTop: HUD, bottomPx: 70, sidePx: side }, false)!;
    if (!plan.track) {
      for (const e of events) {
        if (e.type !== "shot") continue;
        for (let i = 0; i < e.samples.length; i += 2) {
          const [x] = worldToScreen({ cx: plan.cxFrom, cy: plan.cy, zoom: plan.zoom }, view, e.samples[i], e.samples[i + 1]);
          if (e.samples[i] >= 0 && e.samples[i] < WORLD_WIDTH) expect(x).toBeGreaterThanOrEqual(side - 1);
        }
      }
    }
    expect(plan.halfW).toBeLessThan(planFlight(events, view, { hudTop: HUD, bottomPx: 70 }, false)!.halfW);
  });

  // D-025 보충 2 리뷰 확정: 맵 끝 근처 탱크는 화면이 월드 끝을 넘지 못해(clampCamera) 패드 밑에 숨었다 — 가려지는 폭만큼 월드 밖까지 간다
  it("양옆이 가려지면 맵 끝 탱크·두 탱크를 다 못 담을 때의 내 탱크도 가림 안쪽(월드 끝 밖까지 카메라가 간다)", () => {
    const view = { width: 812, height: 331 };
    const side = 150;
    const settle = (me: { x: number; y: number }, enemy: { x: number; y: number } | null) => {
      let cam = clampCamera({ cx: 1024, cy: 500, zoom: 0.9 }, view, { bottomPx: 70, sidePx: side });
      for (let f = 0; f < 600; f++) {
        const p = followPlan({ view, me, enemy, hudTop: HUD, bottomPx: 70, sidePx: side })!;
        cam = approachLimited(cam, view, p.target, TURN_MOTION, DT, p.bounds);
      }
      return worldToScreen(cam, view, me.x, me.y)[0];
    };
    expect(settle({ x: 112, y: 600 }, { x: 700, y: 600 })).toBeGreaterThanOrEqual(side);
    expect(settle({ x: 20, y: 600 }, null)).toBeGreaterThanOrEqual(side);
    expect(settle({ x: 2040, y: 600 }, null)).toBeLessThanOrEqual(view.width - side);
    // 두 탱크를 다 못 담으면 내 탱크 쪽으로 — 그래도 가림 안쪽
    expect(settle({ x: 1700, y: 600 }, { x: 150, y: 600 })).toBeLessThanOrEqual(view.width - side);
    // 가림이 없으면 예전처럼 월드 끝까지만
    expect(clampCamera({ cx: -500, cy: 600, zoom: 1 }, view).cx).toBe(view.width / 2);
    expect(clampCamera({ cx: -500, cy: 600, zoom: 1 }, view, { sidePx: side }).cx).toBe(view.width / 2 - side);
  });

  it("아래가 조작부에 가려지면(bottomPx) 바닥 근처 탱크도 그 위에 담는다", () => {
    const view = { width: 1280, height: 700 };
    const low = { x: 1000, y: 1010 };
    let camera: Camera = { cx: 1000, cy: 600, zoom: 0.9 };
    for (let f = 0; f < 300; f++) {
      const plan = followPlan({ view, me: low, enemy: null, hudTop: HUD, bottomPx: 200 });
      if (plan) camera = approachLimited(camera, view, plan.target, TURN_MOTION, DT, plan.bounds);
    }
    const [, y] = worldToScreen(camera, view, low.x, low.y);
    expect(y).toBeLessThanOrEqual(view.height - 200);
  });

  it("맵 밖으로 나간 탄은 화면 밖으로 치지 않는다(OUT 표시로 대신)", () => {
    const { events } = fire(SHOTS[0], 7);
    const plan = planFlight(events, VIEWS[0].view, { hudTop: HUD, bottomPx: 0 }, false)!;
    expect(shellsOffscreen(plan, { cx: 1000, cy: 600, zoom: 0.5 }, VIEWS[0].view, [{ id: 0, x: WORLD_WIDTH + 40, y: 300, trail: [] }])).toBe(false);
  });
});
