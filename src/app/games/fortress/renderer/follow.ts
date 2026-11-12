/**
 * 자동 추적 카메라 규칙 (순수, D-024) — 어지럽지 않게: 계획은 발사 순간 한 번, 움직임은 천천히·한 방향으로
 * 1. 탄이 날면(planFlight): 결과 이벤트로 비행 전체(모든 탄 샘플)를 미리 안다 → 줌·세로는 비행 내내 하나
 *    - 경로 전체가 FLIGHT_MIN_ZOOM 이상으로 들어가면 그 자리에 고정 화면
 *    - 안 들어가면 그 배율로 가로만, 앞선 탄을 따라 진행 방향으로만 움직인다(되돌아가지 않는다)
 *    - 움직임 줄이기 설정이면 경로 전체가 들어가는 배율로 고정(작아져도)
 *    - 가장 멀리 빼도 세로가 다 안 들어가면(휴대폰 가로의 높은 포물선) 세로는 가장자리에 닿을 때만 따라간다 —
 *      위로는 솟아오르는 탄만(하늘에서 떨어지는 폭격탄은 곧 내려오니 쫓아 올라가지 않는다), 아래로는 떨어지는 탄만. 그래서 위아래 왕복은 많아야 한 번
 *    - 시작(flightBegin): 비행 전체를 차분한 추종(FLIGHT_MOTION)으로 미리 돌려 본다. 탄을 한 프레임도 놓치지 않으면 지금 자리에서 부드럽게,
 *      놓치는 발이면(앞 착탄 자리·크게 확대된 채·리플레이 연속 턴) 처음에 한 번만 비행 시작 화면으로 넘어간다(컷) — 휙 넘어가는 이동·속도 바꾸기 없이
 *    - 움직임 줄이기 설정이면 늘 컷(애니메이션 없이 고정 화면)
 * 2. 탄이 없는 연출(낙하·폭발 여운)·착탄 직후(IMPACT_HOLD_MS): 그 자리에 머문다 — 호출하는 쪽(useBattleView)이 목표를 주지 않는다
 * 3. 그 밖(조준·다음 턴, followPlan): 차례 탱크(조준 중엔 이동 미리보기 자리) + 가장 가까운 적 — 천천히 한 번
 * 실제 이동은 camera.approachLimited — 비율 추종 + 프레임당 이동·줌 변화 상한
 */

import { type MatchEvent, WORLD_WIDTH } from "../engine";
import { type Camera, type CameraBounds, SKY_MARGIN, type ViewSize, approachLimited, clampCamera, frameTargets, minZoom, worldToScreen } from "./camera";
import { type ShellView, playbackEnd, shellsAt } from "./playback";

export const TURN_ZOOM = 0.9;
/** 조준 중 내 탱크와 가까운 적을 함께 담을 때 이보다 멀리 빼지 않는다(탱크가 너무 작아지지 않게) — 못 담으면 화면 밖 표시 */
export const AIM_FRAME_MIN_ZOOM = 0.42;
/** 비행 계획 — 경로 전체가 이 배율 이상으로 들어가면 고정 화면, 아니면 이 배율로 가로만 따라간다 */
export const FLIGHT_MIN_ZOOM = 0.34;
/** 착탄 지점에 머무는 시간(ms) */
export const IMPACT_HOLD_MS = 700;
/** 화면 가장자리 여백(px) */
const MARGIN = 56;
/** 따라갈 때 앞선 탄을 화면 가운데보다 이만큼(보이는 반폭 비율) 뒤에 둔다 — 진행 방향 앞을 더 보이게 */
const TRACK_LEAD = 0.25;

/** 추종 속도(60fps 기준 비율)·프레임당 상한 — 비행은 탄을 놓치지 않을 만큼, 턴 전환은 천천히 */
export const FLIGHT_MOTION = { rate: 0.12, maxPx: 18, maxZoomStep: 0.02 } as const;
export const TURN_MOTION = { rate: 0.06, maxPx: 14, maxZoomStep: 0.012 } as const;

type Point = { x: number; y: number };

export type Insets = {
  /** 화면 위 HUD에 가리는 높이(px) */
  hudTop: number;
  /** 화면 아래 조작부에 가리는 높이(px) */
  bottomPx: number;
  /** 화면 양옆에 가리는 폭(px) — 터치 가로 화면에서 전장 위에 겹친 패드(D-025). 없으면 0 */
  sidePx?: number;
};

export type FlightPlan = {
  zoom: number;
  cy: number;
  /** 고정 화면이면 cxFrom = cxTo. 따라가면 cxFrom → cxTo 쪽(dir)으로만 */
  cxFrom: number;
  cxTo: number;
  dir: 1 | -1;
  track: boolean;
  /** 따라갈 때 앞선 탄 앞쪽 여유(월드 px) */
  lead: number;
  /** 첫 탄이 나간 가로 자리 · 보이는 반폭(월드 px) — 비행 시작 자리가 출발점을 담게 */
  launchX: number;
  halfW: number;
  /** 세로가 다 안 들어간다 — 탄이 보이는 위·아래 끝(여백 안쪽)에 닿을 때만 세로로 따라간다 */
  trackY: boolean;
  /** 보이는 세로 범위(카메라 중심 기준, 월드 px) — HUD·조작부에 가리는 만큼 뺀 위·아래 */
  above: number;
  below: number;
  bounds: CameraBounds;
};

/** 세로 따라가기 여백(px) — 탄이 이만큼 안쪽에 있으면 세로는 그대로 */
const EDGE_PX = 36;

/**
 * 하늘 한계를 계획 화면의 위쪽 끝까지 — 비행 중 줌을 빼는 동안 범위 끝(clampCamera)에 밀려 세로가 위아래로 출렁이지 않게
 * (한계가 계획 화면보다 아래면 축소 도중 위쪽 끝이 카메라를 아래로 밀었다가, 다 빼면 바닥 맞춤으로 다시 올린다)
 */
function reachTop(bounds: CameraBounds, at: Camera, view: ViewSize): void {
  bounds.skyTop = Math.min(bounds.skyTop ?? -SKY_MARGIN, at.cy - view.height / 2 / at.zoom);
}

/** 비행 경로의 점 — 모든 탄 샘플(맵 밖은 월드 가로 안으로 자른다) */
function flightPoints(events: readonly MatchEvent[]): { points: Point[]; dir: 1 | -1; launchX: number } | null {
  const points: Point[] = [];
  let first: Extract<MatchEvent, { type: "shot" }> | null = null;
  for (const e of events) {
    if (e.type !== "shot") continue;
    if (!first || e.t < first.t || (e.t === first.t && e.projectileId < first.projectileId)) first = e;
    for (let i = 0; i < e.samples.length; i += 2) points.push({ x: Math.max(0, Math.min(WORLD_WIDTH, e.samples[i])), y: e.samples[i + 1] });
  }
  if (!first || points.length === 0) return null;
  const n = first.samples.length;
  return { points, dir: first.samples[n - 2] >= first.samples[0] ? 1 : -1, launchX: Math.max(0, Math.min(WORLD_WIDTH, first.samples[0])) };
}

/** 발사 순간 비행 계획 — 탄이 없는 행동(넘기기 아닌 기권·스킵 등)이면 null */
export function planFlight(events: readonly MatchEvent[], view: ViewSize, insets: Insets, reducedMotion: boolean): FlightPlan | null {
  const flight = flightPoints(events);
  if (!flight) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of flight.points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const top = insets.hudTop;
  const bottom = insets.bottomPx + 24;
  const bounds: CameraBounds = { bottomPx: insets.bottomPx, sidePx: insets.sidePx, skyTop: Math.min(-SKY_MARGIN, y0 - 80) };
  const usableW = Math.max(1, view.width - (MARGIN + (insets.sidePx ?? 0)) * 2);
  const usableH = Math.max(1, view.height - top - bottom);
  const fitX = usableW / Math.max(1, x1 - x0);
  const fitY = usableH / Math.max(1, y1 - y0);
  const floor = minZoom(view);
  const centerY = (zoom: number) => (y0 + y1) / 2 + (bottom - top) / 2 / zoom;
  /** 보이는 세로 범위 — 카메라 중심에서 위로 above, 아래로 below(HUD·조작부·여백을 뺀) */
  const reach = (zoom: number) => ({ above: Math.max(0, (view.height / 2 - top - EDGE_PX) / zoom), below: Math.max(0, (view.height / 2 - bottom - EDGE_PX) / zoom) });
  if (reducedMotion || Math.min(fitX, fitY) >= FLIGHT_MIN_ZOOM) {
    const zoom = Math.max(floor, Math.min(TURN_ZOOM, fitX, fitY));
    const c = clampCamera({ cx: (x0 + x1) / 2, cy: centerY(zoom), zoom }, view, bounds);
    reachTop(bounds, c, view);
    // 움직임 줄이기는 세로도 고정 — 세로가 넘치면 그만큼 덜 보이는 것을 받아들인다
    return { zoom: c.zoom, cy: c.cy, cxFrom: c.cx, cxTo: c.cx, dir: flight.dir, track: false, lead: 0, launchX: flight.launchX, halfW: usableW / 2 / c.zoom, trackY: !reducedMotion && fitY < floor, ...reach(c.zoom), bounds };
  }
  // 가로가 넘친다 — 세로는 다 담는 배율(가로를 다 담는 것보다 크게), 가로만 따라간다
  const zoom = Math.max(floor, Math.min(FLIGHT_MIN_ZOOM, fitY));
  const halfW = usableW / 2 / zoom;
  const from = clampCamera({ cx: flight.dir > 0 ? x0 + halfW : x1 - halfW, cy: centerY(zoom), zoom }, view, bounds);
  const to = clampCamera({ cx: flight.dir > 0 ? x1 - halfW : x0 + halfW, cy: centerY(zoom), zoom }, view, bounds);
  reachTop(bounds, from, view);
  return { zoom: from.zoom, cy: from.cy, cxFrom: from.cx, cxTo: to.cx, dir: flight.dir, track: true, lead: halfW * TRACK_LEAD, launchX: flight.launchX, halfW, trackY: fitY < floor, ...reach(from.zoom), bounds };
}

/**
 * 비행 시작 때의 따라가기 기준 — 지금 카메라 자리를 계획 범위 안으로(처음부터 반대쪽으로 갔다 오지 않게), 단 출발점이 보이는 자리까지만
 * (앞 착탄 자리처럼 도착 쪽에 있던 카메라는 출발점이 보이는 쪽으로 한 번 돌아온다). 세로를 따라가면 지금 높이에서 시작
 */
export function flightStart(plan: FlightPlan, camera: { cx: number; cy: number }): { cx: number; cy: number } {
  const lo = Math.min(plan.cxFrom, plan.cxTo);
  const hi = Math.max(plan.cxFrom, plan.cxTo);
  let cx = plan.cxFrom;
  if (plan.track) {
    // 출발점이 화면 뒤쪽 끝에서 보이는 반폭의 20% 안쪽에 들어오는 가장 앞자리
    const reachLaunch = plan.launchX + plan.dir * plan.halfW * 0.8;
    cx = Math.max(lo, Math.min(hi, camera.cx));
    cx = plan.dir > 0 ? Math.min(cx, Math.max(lo, reachLaunch)) : Math.max(cx, Math.min(hi, reachLaunch));
  }
  return { cx, cy: plan.trackY ? camera.cy : plan.cy };
}

/**
 * 다시 계획(회전·리사이즈·"내 탱크로")할 때 이어 갈 가로 기준 — 지난 목표를 새 범위로 자르되, 지금 날고 있는 가장 뒤쪽 탄이 보이는 자리까지만
 * (지난 계획이 고정 화면이면 지난 목표가 경로 가운데라, 그대로 잇으면 "뒤로 가지 않음" 때문에 출발점 쪽 탄을 다시 담지 못한다)
 */
function resumeCx(plan: FlightPlan, events: readonly MatchEvent[], fromTick: number, resume: { cx: number; cy: number }): number {
  const lo = Math.min(plan.cxFrom, plan.cxTo);
  const hi = Math.max(plan.cxFrom, plan.cxTo);
  if (!plan.track) return plan.cxFrom;
  let cx = Math.max(lo, Math.min(hi, resume.cx));
  let rear: number | null = null;
  for (const s of shellsAt(events, fromTick)) {
    const x = Math.max(0, Math.min(WORLD_WIDTH, s.x));
    if (rear === null || (plan.dir > 0 ? x < rear : x > rear)) rear = x;
  }
  if (rear !== null) {
    const reach = rear + plan.dir * plan.halfW * 0.8;
    cx = plan.dir > 0 ? Math.min(cx, Math.max(lo, reach)) : Math.max(cx, Math.min(hi, reach));
  }
  return cx;
}

/** 컷할 화면 — 계획 배율로, fromTick에 날고 있는 탄을 담는 자리(비행 처음이면 출발점을 담는 경로 앞쪽 끝, 다시 계획이면 지금 탄 자리) */
function cutCamera(plan: FlightPlan, events: readonly MatchEvent[], fromTick: number, resume?: { cx: number; cy: number }): Camera {
  const base = { cx: resume ? resumeCx(plan, events, fromTick, resume) : plan.cxFrom, cy: plan.cy };
  const target = flightTarget(plan, shellsAt(events, fromTick), base);
  return { cx: target.cx, cy: target.cy, zoom: plan.zoom };
}

/** 보여야 할 탄이 화면 밖인가 — 맵 밖 탄은 OUT 표시로 대신하고, 세로가 넘치는 화면에서 하늘에서 떨어지는 탄은 기다린다(flightTarget과 같은 예외) */
export function shellsOffscreen(plan: FlightPlan, camera: Camera, view: ViewSize, shells: readonly ShellView[]): boolean {
  for (const s of shells) {
    if (s.x < 0 || s.x >= WORLD_WIDTH) continue;
    const [x, y] = worldToScreen(camera, view, s.x, s.y);
    if (plan.trackY && y < 0 && !isRising(s)) continue;
    if (x < -1 || x > view.width + 1 || y < -1 || y > view.height + 1) return true;
  }
  return false;
}

/** 비행 중 한 프레임 — 차분한 추종(FLIGHT_MOTION), 범위는 계획의 것(하늘 한계가 계획 화면 위쪽 끝까지라 줌을 빼는 동안 출렁이지 않는다) */
export function flightStep(plan: FlightPlan, camera: Camera, view: ViewSize, target: Camera, dtMs: number): Camera {
  return approachLimited(camera, view, target, FLIGHT_MOTION, dtMs, plan.bounds);
}

/**
 * fromTick부터 끝까지 차분한 추종으로 돌려 탄을 놓치는 프레임이 있나(기본 60fps, 30틱/초 — 틱마다 두 프레임)
 * 연출의 첫 프레임은 시계가 아직 흐르지 않아 fromTick에 한 프레임이 더 붙는다(useBattleView와 같은 위상 — 어긋나면 컷하지 않은 발이 가장자리에서 잘린다)
 * 다시 계획(resume)은 틱 중간에 일어나 그 틱에 남은 프레임을 모른다 — 한 프레임만 본다(보수적으로: 다음 틱에 더 일찍 닿는다고 본다)
 * 판정에 안쪽 여유는 두지 않는다 — 보통 발도 비행 초반에 가장자리를 스치는 일이 흔해 여유를 두면 컷이 잦아진다(6px에서 조준 화면 발의 17%). 시작 판정은 120Hz·30fps, 쏘기 전 기다림(readyToFly)은 30·60·120·240Hz를 테스트로 확인
 * frameMs: 프레임 간격(기본 60fps) — 쏘기 전 기다림(readyToFly)이 여러 화면 주사율로 본다
 */
function missesAnyShell(plan: FlightPlan, events: readonly MatchEvent[], camera: Camera, view: ViewSize, prev: { cx: number; cy: number }, fromTick: number, resuming: boolean, frameMs = 1000 / 60): boolean {
  const perTick = Math.max(1, Math.round(1000 / 30 / frameMs));
  let cam = camera;
  let p = prev;
  const end = playbackEnd(events);
  for (let tick = fromTick; tick <= end; tick++) {
    const shells = shellsAt(events, tick);
    if (shells.length === 0) continue;
    for (let k = tick !== fromTick ? 0 : resuming ? perTick - 1 : -1; k < perTick; k++) {
      const target = flightTarget(plan, shells, p);
      p = target;
      cam = flightStep(plan, cam, view, target, frameMs);
      if (shellsOffscreen(plan, cam, view, shells)) return true;
    }
  }
  return false;
}

/**
 * 비행 시작(또는 회전·리사이즈로 다시 계획한 뒤 이어 가기) — 카메라를 컷할지와 따라가기 기준
 * resume: 이어 갈 지난 목표(있으면 출발점 제한 없이 그 자리에서), fromTick: 연출의 지금 틱
 */
export function flightBegin(
  plan: FlightPlan,
  events: readonly MatchEvent[],
  camera: Camera,
  view: ViewSize,
  { reducedMotion = false, resume, fromTick = 0 }: { reducedMotion?: boolean; resume?: { cx: number; cy: number }; fromTick?: number } = {},
): { cut: Camera | null; prev: { cx: number; cy: number } } {
  const at = clampCamera(cutCamera(plan, events, fromTick, resume), view, plan.bounds);
  const cut = { cut: at, prev: { cx: at.cx, cy: at.cy } };
  if (reducedMotion) return cut;
  const prev = resume ? { cx: resumeCx(plan, events, fromTick, resume), cy: plan.trackY ? camera.cy : plan.cy } : flightStart(plan, camera);
  return missesAnyShell(plan, events, camera, view, prev, fromTick, resume !== undefined) ? cut : { cut: null, prev };
}

/** 쏘기 전 기다림의 판정 주사율 — 30fps·60Hz·120Hz·240Hz(주사율이 높을수록 첫 프레임 이동이 작다 — 240Hz가 144·165Hz도 덮는다) */
const READY_FRAME_MS = [1000 / 30, 1000 / 60, 1000 / 120, 1000 / 240] as const;

/**
 * 지금 카메라에서 쏘면 컷 없이 따라갈 수 있나 — AI 발사·리플레이 자동 재생의 기다림(useBattleView.cameraReadyFor)
 * 시작 판정(flightBegin)은 60fps만 보지만, 기다림은 처음 '준비'된 경계에서 멈추니 120Hz 이상(첫 프레임 이동이 작다)·30fps에서 포구의 탄이 가장자리 밖에 남을 수 있다 — 모든 판정 주사율에서 놓치지 않을 때만 준비
 */
export function readyToFly(plan: FlightPlan, events: readonly MatchEvent[], camera: Camera, view: ViewSize): boolean {
  const prev = flightStart(plan, camera);
  return READY_FRAME_MS.every((frameMs) => !missesAnyShell(plan, events, camera, view, prev, 0, false, frameMs));
}

/** 비행 중 목표 — 줌은 계획 그대로. 가로는 앞선 탄을 따라 진행 방향으로만(prev.cx보다 뒤로 가지 않는다), 세로는 계획 자리(trackY면 가장자리에 닿을 때만) */
export function flightTarget(plan: FlightPlan, shells: readonly ShellView[], prev: { cx: number; cy: number }): Camera {
  let front: ShellView | null = null;
  for (const s of shells) if (!front || (plan.dir > 0 ? s.x > front.x : s.x < front.x)) front = s;
  let cx = plan.track ? prev.cx : plan.cxFrom;
  if (plan.track && front) {
    const lo = Math.min(plan.cxFrom, plan.cxTo);
    const hi = Math.max(plan.cxFrom, plan.cxTo);
    const want = Math.max(lo, Math.min(hi, Math.max(0, Math.min(WORLD_WIDTH, front.x)) + plan.dir * plan.lead));
    cx = plan.dir > 0 ? Math.max(prev.cx, want) : Math.min(prev.cx, want);
  }
  let cy = plan.trackY ? prev.cy : plan.cy;
  if (plan.trackY && shells.length > 0) {
    let risingTop = Infinity;
    let fallingLow = -Infinity;
    for (const s of shells) {
      const v = verticalMove(s);
      if (v < 0) risingTop = Math.min(risingTop, s.y);
      else if (v > 0) fallingLow = Math.max(fallingLow, s.y);
    }
    if (risingTop < cy - plan.above) cy = risingTop + plan.above;
    else if (fallingLow > cy + plan.below) cy = fallingLow - plan.below;
  }
  return { cx, cy, zoom: plan.zoom };
}

/** 세로 움직임 — 꼬리 마지막 두 점(음수 오름·양수 내림). 꼬리가 한 점뿐인 갓 생긴 탄은 0(하늘에서 생기는 폭격탄을 쫓아 올라가지 않게, 포구의 첫 틱은 이미 화면 안) */
function verticalMove(s: ShellView): number {
  const n = s.trail.length / 2;
  return n >= 2 ? s.trail[n * 2 - 1] - s.trail[n * 2 - 3] : 0;
}

/** 탄이 위로 가는 중인가 */
export function isRising(s: ShellView): boolean {
  return verticalMove(s) < 0;
}

export type FollowInput = {
  view: ViewSize;
  /** 차례 탱크(조준 중엔 미리보기 자리) */
  me: Point | null;
  enemy: Point | null;
} & Insets;

export type FollowPlan = { target: Camera; bounds: CameraBounds };

/** 조준·턴 — 차례 탱크와 가까운 적을 함께(못 담으면 내 탱크 쪽으로) */
export function followPlan(i: FollowInput): FollowPlan | null {
  if (!i.me) return null;
  const bounds: CameraBounds = { bottomPx: i.bottomPx, sidePx: i.sidePx };
  const pts = [
    { x: i.me.x, y: i.me.y - 70 },
    { x: i.me.x, y: i.me.y + 30 },
  ];
  if (i.enemy) pts.push({ x: i.enemy.x, y: i.enemy.y - 50 }, { x: i.enemy.x, y: i.enemy.y + 30 });
  return { target: frameTargets(pts, i.view, { margin: MARGIN + (i.sidePx ?? 0), lo: AIM_FRAME_MIN_ZOOM, hi: TURN_ZOOM, top: i.hudTop, bottom: i.bottomPx + 24, bounds }), bounds };
}
