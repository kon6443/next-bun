/**
 * 카메라 — 월드(2048×1024 px)가 화면보다 크다. 중심(cx, cy)·배율(zoom = 화면 px / 월드 px)로 보이는 영역을 정한다
 * 팬·핀치 줌·추적은 모두 이 순수 함수들로 계산하고, 화면 크기가 바뀌거나 줌이 바뀌면 clampCamera로 범위를 맞춘다
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from "../engine";

export type Camera = { cx: number; cy: number; zoom: number };
export type ViewSize = { width: number; height: number };

/** 월드 위로 이만큼(px)까지는 하늘을 보여 준다 — 높이 쏜 탄 추적 */
export const SKY_MARGIN = 420;
export const MAX_ZOOM = 2.5;

/** 가장 멀리 — 월드 가로 전체가 들어오는 배율(세로 화면에서는 가로가 기준) */
export function minZoom(view: ViewSize): number {
  return Math.min(view.width / WORLD_WIDTH, view.height / (WORLD_HEIGHT + SKY_MARGIN));
}

/**
 * 카메라가 갈 수 있는 범위 넓히기 — skyTop: 하늘 위쪽 한계(월드 y, 기본 −SKY_MARGIN, 높이 쏜 탄 추적),
 * bottomPx: 화면 아래가 가려지는 높이(px, 데스크톱 조작부) — 그만큼 월드 바닥 아래까지 내려가 바닥 근처가 가리지 않게
 * sidePx: 화면 양옆이 가려지는 폭(px, 터치 가로의 겹친 패드) — 그만큼 월드 양끝 밖까지 가 맵 끝 탱크가 패드 밑에 숨지 않게(D-025)
 */
export type CameraBounds = { skyTop?: number; bottomPx?: number; sidePx?: number };

/** 배율을 [minZoom, MAX_ZOOM]로, 중심을 보이는 영역이 월드(+하늘 여백) 밖으로 나가지 않게 */
export function clampCamera(camera: Camera, view: ViewSize, bounds: CameraBounds = {}): Camera {
  const zoom = Math.max(minZoom(view), Math.min(MAX_ZOOM, camera.zoom));
  const halfW = view.width / zoom / 2;
  const halfH = view.height / zoom / 2;
  const clampAxis = (v: number, lo: number, hi: number, half: number) => (hi - lo <= half * 2 ? (lo + hi) / 2 : Math.max(lo + half, Math.min(hi - half, v)));
  // 세로가 월드(+하늘 여백)보다 길게 보이면 바닥을 화면 아래에 맞춘다 — 남는 만큼은 위쪽 하늘(배경)로, 월드 아래 빈 땅이 보이지 않게
  const lo = Math.min(-SKY_MARGIN, bounds.skyTop ?? -SKY_MARGIN);
  const hi = WORLD_HEIGHT + (bounds.bottomPx ?? 0) / zoom;
  const cy = hi - lo <= halfH * 2 ? hi - halfH : Math.max(lo + halfH, Math.min(hi - halfH, camera.cy));
  const side = (bounds.sidePx ?? 0) / zoom;
  return { zoom, cx: clampAxis(camera.cx, -side, WORLD_WIDTH + side, halfW), cy };
}

export function worldToScreen(camera: Camera, view: ViewSize, x: number, y: number): [number, number] {
  return [(x - camera.cx) * camera.zoom + view.width / 2, (y - camera.cy) * camera.zoom + view.height / 2];
}

export function screenToWorld(camera: Camera, view: ViewSize, sx: number, sy: number): [number, number] {
  return [(sx - view.width / 2) / camera.zoom + camera.cx, (sy - view.height / 2) / camera.zoom + camera.cy];
}

/** 화면에서 (dx, dy) px 끌었을 때 — 내용이 손가락을 따라오게 중심은 반대로 */
export function panBy(camera: Camera, view: ViewSize, dx: number, dy: number, bounds: CameraBounds = {}): Camera {
  return clampCamera({ ...camera, cx: camera.cx - dx / camera.zoom, cy: camera.cy - dy / camera.zoom }, view, bounds);
}

/** 화면 점(sx, sy)을 고정한 채 배율을 factor배 — 핀치·휠 */
export function zoomAt(camera: Camera, view: ViewSize, sx: number, sy: number, factor: number, bounds: CameraBounds = {}): Camera {
  const [wx, wy] = screenToWorld(camera, view, sx, sy);
  const zoom = Math.max(minZoom(view), Math.min(MAX_ZOOM, camera.zoom * factor));
  // 줌 뒤에도 (wx, wy)가 같은 화면 점에 오도록 중심을 옮긴다
  const cx = wx - (sx - view.width / 2) / zoom;
  const cy = wy - (sy - view.height / 2) / zoom;
  return clampCamera({ cx, cy, zoom }, view, bounds);
}

/**
 * 목표 쪽으로 다가가기 — 비율(rate, 60fps 한 프레임 기준) 추종에 프레임당 상한: 이동은 화면 maxPx(px)까지, 배율은 (1 ± maxZoomStep)배까지(dtMs에 비례)
 * 지금 하늘 위쪽을 보고 있으면 그 위치까지는 범위로 둔다 — 높이 뜬 탄을 본 뒤 한 번에 뚝 떨어지지 않고 다가가며 내려온다
 * 배율은 곱으로 다가가 확대·축소가 같은 빠르기로 보이게 한다. 상한이 있어 목표가 크게 바뀌어도 화면이 휙 넘어가지 않는다
 */
export function approachLimited(
  camera: Camera,
  view: ViewSize,
  target: Camera,
  { rate, maxPx, maxZoomStep }: { rate: number; maxPx: number; maxZoomStep: number },
  dtMs: number,
  bounds: CameraBounds = {},
): Camera {
  const frames = Math.max(0, dtMs) / (1000 / 60);
  const k = 1 - Math.pow(1 - rate, frames);
  const ratio = Math.pow(target.zoom / camera.zoom, k);
  const zoomCap = Math.pow(1 + maxZoomStep, frames);
  const zoom = camera.zoom * Math.max(1 / zoomCap, Math.min(zoomCap, ratio));
  // 이동 상한은 바뀐 배율로 — 확대하며 움직여도 화면에서 maxPx를 넘지 않게
  const maxWorld = (maxPx * frames) / Math.max(zoom, camera.zoom);
  const step = (from: number, to: number) => {
    const d = (to - from) * k;
    return from + Math.max(-maxWorld, Math.min(maxWorld, d));
  };
  const top = camera.cy - view.height / 2 / camera.zoom;
  const eased = { ...bounds, skyTop: Math.min(bounds.skyTop ?? -SKY_MARGIN, top) };
  return clampCamera({ cx: step(camera.cx, target.cx), cy: step(camera.cy, target.cy), zoom }, view, eased);
}

/**
 * 점들이 모두 화면에 들어오는 카메라 목표 — 가장자리 여백(margin, 화면 px)을 두고 배율을 [lo, hi]로 자른다
 * 배율이 lo에 막혀 다 못 담으면 첫 점(주인공)을 화면 안에 두는 쪽으로 중심을 당긴다
 * top/bottom 여백을 따로 줄 수 있다(위쪽 HUD·아래쪽 조작부에 가리는 만큼)
 */
export function frameTargets(
  points: readonly { x: number; y: number }[],
  view: ViewSize,
  { margin, lo, hi, top = margin, bottom = margin, bounds = {} }: { margin: number; lo: number; hi: number; top?: number; bottom?: number; bounds?: CameraBounds },
): Camera {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const usableW = Math.max(1, view.width - margin * 2);
  const usableH = Math.max(1, view.height - top - bottom);
  const fit = Math.min(usableW / Math.max(1, x1 - x0), usableH / Math.max(1, y1 - y0));
  const zoom = Math.max(Math.max(lo, minZoom(view)), Math.min(hi, fit));
  // 화면 중심이 top/bottom 여백 차이만큼 아래로 — 보이는 영역의 가운데에 맞춘다
  const shiftY = (bottom - top) / 2 / zoom;
  let cx = (x0 + x1) / 2;
  let cy = (y0 + y1) / 2 + shiftY;
  const first = points[0];
  if (first) {
    const halfW = usableW / 2 / zoom;
    const halfH = usableH / 2 / zoom;
    cx = Math.max(first.x - halfW, Math.min(first.x + halfW, cx));
    cy = Math.max(first.y + shiftY - halfH, Math.min(first.y + shiftY + halfH, cy));
  }
  return clampCamera({ cx, cy, zoom }, view, bounds);
}
