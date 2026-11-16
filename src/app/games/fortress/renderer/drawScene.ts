/**
 * 한 프레임 그리기 — 배경(하늘·산·구름·바람 줄기) → [흔들림] 지형 레이어(카메라 변환 drawImage) → 탱크 → 이동 계획·조준선 → 탄·꼬리
 * → 폭발·입자 → (화면 좌표) 이름표·HP 막대·피해 숫자·화면 밖 표시
 * 좌표는 월드 px. ctx는 CSS px 기준(setTransform(dpr))으로 받는다
 */

import { TANK_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, cosDeg, sinDeg } from "../engine";
import type { Quality } from "./backdrop";
import { type Camera, type ViewSize, worldToScreen } from "./camera";
import { type Effects, drawEffects, shakeOffset } from "./effects";
import type { BlastView, PopupView, ShellView, TankView } from "./playback";
import type { TerrainLayer } from "./terrainLayer";
import { DEFAULT_TANK_SKIN, type TankSkin } from "../lib/tankSkins";
import { drawBlastVivid, drawMuzzleShell, drawPopupVivid, drawShellVivid, stackPopupYs, weaponFx } from "./vivid";
import { drawWindLeaves, drawWorldBackdrop, drawWorldGrade, worldTheme } from "./vividWorld";
import type { MapId } from "../engine";
import { type TankAnim, drawTankArt } from "./tankArt";
import { TURN_RING_MS, drawAimGuide, drawAimPath, drawLastImpact, drawTurnRing } from "./aimMarks";
import { drawOffscreenChips, drawOuts } from "./edgeMarks";
import { blastDrawRadius, tankDrawScale } from "./scale";

export { BLAST_MIN_PX, blastDrawRadius, tankDrawScale } from "./scale";
export { type OffscreenChip, offscreenChipLayout } from "./edgeMarks";
export { TURN_RING_MS } from "./aimMarks";

export type Aim = {
  slot: number;
  x: number;
  y: number;
  angle: number;
  power: number;
  /** 예상 궤적 앞부분(월드 [x0, y0, x1, y1, …], lib/aimAssist) — 있으면 직선 조준선 대신 */
  path?: readonly number[] | null;
  /** 이 탱크의 지난 발 착탄점 */
  lastImpact?: { x: number; y: number } | null;
  /** 고른 무기(엔진 WEAPONS id) — 시안은 포구 앞에 그 무기의 탄 모양을 보여 준다 */
  weaponId?: number;
  /** 충전 중(누르고 있는 동안) — 시안은 탱크가 움찔거린다 */
  charging?: boolean;
};

export type Scene = {
  camera: Camera;
  view: ViewSize;
  layer: TerrainLayer | null;
  tanks: TankView[];
  colorOf: (slot: number) => string;
  /** 탱크 스킨(F7) — 없으면 기본 */
  skinOf?: (slot: number) => TankSkin;
  /** 이름표 글자 — 없으면 이름표 생략 */
  labelOf?: (slot: number) => string;
  /** HP 막대 기준(탱크 종류의 최대 HP) */
  maxHpOf?: (slot: number) => number;
  /** 포신 각도(도) — 조준 중인 탱크는 aim.angle */
  barrelOf?: (slot: number) => number;
  /** 현재 턴 탱크 — 위에 표시 */
  activeSlot: number | null;
  aim: Aim | null;
  shells: ShellView[];
  blasts: BlastView[];
  popups: PopupView[];
  /** 맵 밖으로 나간 탄 자리(월드) — 화면 가장자리에 OUT */
  outs?: readonly { x: number; y: number }[];
  /** 화면 밖 탱크 칩 — 기본 표시(정지 미리보기는 끈다) */
  offscreenChips?: boolean;
  /** 화면 아래가 조작부에 가리는 높이(px) — 화면 밖 판정·표시를 그 위로 */
  insetBottom?: number;
  /** 양옆이 가려지는 폭(px, 터치 가로의 겹친 패드) — 화면 밖 칩을 그 안쪽에 붙인다 */
  insetSide?: number;
  /** 아래는 연출 — 없으면 기본값(테스트·간단한 화면) */
  time?: number;
  wind?: number;
  quality?: Quality;
  reducedMotion?: boolean;
  fx?: Effects;
  /** 맵(시안 배경·팔레트 테마) */
  mapId?: MapId;
  /** 이번 연출의 무기(엔진 WEAPONS id) — 시안의 무기별 탄·폭발, 없으면 포탄 모양 */
  weaponId?: number;
  /** 지금 차례 탱크가 차례를 받은 시각(time과 같은 시계, ms) — 시안은 처음 잠깐 금빛 고리가 퍼진다 */
  activeSince?: number;
  /** 시안 탱크 애니메이션(slot별) — 없으면 정지 자세 */
  tankAnimOf?: (slot: number) => TankAnim | undefined;
};

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, view } = scene;
  const time = scene.time ?? 0;
  const reducedMotion = scene.reducedMotion ?? false;
  const backdrop = { time, wind: scene.wind ?? 0, quality: scene.quality ?? "high", reducedMotion };
  drawWorldBackdrop(ctx, view, camera, backdrop, worldTheme(scene.mapId));

  const [sx, sy] = scene.fx ? shakeOffset(scene.fx, time) : [0, 0];
  ctx.save();
  ctx.translate(view.width / 2 + sx, view.height / 2 + sy);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.cx, -camera.cy);

  // 월드 밖 — 좌우 벽 바깥은 어둡게, 바닥 아래는 암반
  ctx.fillStyle = "rgba(30, 10, 30, 0.3)";
  ctx.fillRect(-4000, -10000, 4000, 10000 + WORLD_HEIGHT + 4000);
  ctx.fillRect(WORLD_WIDTH, -10000, 4000, 10000 + WORLD_HEIGHT + 4000);
  ctx.fillStyle = "#0b0a12";
  ctx.fillRect(-4000, WORLD_HEIGHT, WORLD_WIDTH + 8000, 4000);

  if (scene.layer) {
    // 확대해서 볼 때만 부드럽게(흙이 픽셀 덩어리로 보이지 않게) — 멀리 볼 때는 차이가 안 보이고 보간 비용만 크다
    ctx.imageSmoothingEnabled = camera.zoom > 1.15 && scene.quality !== "low";
    ctx.drawImage(scene.layer.canvas, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  const aim = scene.aim;
  const scale = tankDrawScale(camera.zoom);
  drawTanks(ctx, scene, scale, time, reducedMotion);

  // 이동 계획 — 이동은 발사 때 한꺼번에 하므로 갈 자리를 반투명 탱크와 점선 화살표로 보여 준다(조준선은 그 자리에서 나간다)
  const mover = aim ? scene.tanks.find((t) => t.slot === aim.slot && t.alive) : undefined;
  if (aim && mover && Math.abs(aim.x - mover.x) >= 1) {
    const dir = aim.x > mover.x ? 1 : -1;
    const lineY = Math.min(mover.y, aim.y) - TANK_RADIUS * scale * 2.4;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.85)";
    ctx.lineWidth = 2 / camera.zoom;
    ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
    ctx.beginPath();
    ctx.moveTo(mover.x, lineY);
    ctx.lineTo(aim.x - dir * 6, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
    ctx.beginPath();
    ctx.moveTo(aim.x, lineY);
    ctx.lineTo(aim.x - dir * 8, lineY - 5);
    ctx.lineTo(aim.x - dir * 8, lineY + 5);
    ctx.fill();
    drawTankArt(ctx, { x: aim.x, y: aim.y, color: scene.colorOf(aim.slot), angle: aim.angle, scale, zoom: camera.zoom, skin: scene.skinOf?.(aim.slot) ?? DEFAULT_TANK_SKIN, time, alpha: 0.45, reducedMotion: true });
  }

  if (aim?.lastImpact) drawLastImpact(ctx, aim.lastImpact, scene.colorOf(aim.slot), camera.zoom);
  if (aim) {
    if (aim.path && aim.path.length >= 4) drawAimPath(ctx, aim.path, camera.zoom);
    else drawAimGuide(ctx, aim, camera.zoom, scale);
    // 포구 앞에 고른 무기의 탄(무기를 바꾸면 모양·색이 바로 바뀐다)
    if (aim.weaponId !== undefined) {
      const R = TANK_RADIUS * scale;
      const tipX = aim.x + (R * 2.45 * cosDeg(aim.angle)) / 10000;
      const tipY = aim.y - R * 1.15 - (R * 2.45 * sinDeg(aim.angle)) / 10000;
      drawMuzzleShell(ctx, tipX, tipY, aim.angle, camera.zoom, weaponFx(aim.weaponId), time, reducedMotion);
    }
  }

  const wfx = weaponFx(scene.weaponId);
  for (const s of scene.shells) drawShellVivid(ctx, s, camera.zoom, wfx, time, reducedMotion);

  for (const b of scene.blasts) {
    // 멀리 볼 때도 화면에서 일정 크기(반지름 BLAST_MIN_PX) 이상 — 무기 크기 비율은 유지
    // 첫 프레임부터 크게 터진다(작게 시작해 부풀면 착탄 순간의 한 방이 약하다)
    const r = blastDrawRadius(b.r, camera.zoom) * (0.7 + 0.3 * Math.min(1, b.progress * 3));
    drawBlastVivid(ctx, b, r, wfx, reducedMotion);
  }
  if (scene.fx) drawEffects(ctx, scene.fx, camera.zoom, (r) => blastDrawRadius(r, camera.zoom) / r);
  // 차례를 받은 탱크 둘레에 금빛 고리가 퍼진다(약 0.9초, 움직임 줄이기면 퍼지지 않고 잠깐 고정 고리)
  if (scene.activeSlot !== null && scene.activeSince !== undefined) {
    const t = scene.tanks.find((x) => x.slot === scene.activeSlot && x.alive);
    const age = time - scene.activeSince;
    if (t && age >= 0 && age < TURN_RING_MS) drawTurnRing(ctx, t.x, t.y - TANK_RADIUS, age / TURN_RING_MS, TANK_RADIUS * scale, camera.zoom, reducedMotion);
  }
  ctx.restore();

  // 화면 속 바람(나뭇잎·먼지)
  drawWindLeaves(ctx, view, scene.wind ?? 0, time, scene.mapId, scene.quality ?? "high", reducedMotion);

  // ===== 화면 좌표 =====
  // 이름표·HP 막대·차례 화살표 — 배율과 무관한 크기
  drawTankLabels(ctx, scene, scale, sx, sy, time, reducedMotion);

  // 화면 밖 칩을 먼저 그려 피해 숫자가 칩에 가리지 않게
  if (scene.offscreenChips !== false) drawOffscreenChips(ctx, scene);

  // 피해 숫자 — 같은 탱크에 겹친 숫자(분열탄·3연발·두 단계 폭발)는 먼저 뜬 것을 위로 쌓는다(stackPopupYs — 문구까지 겹치지 않게)
  const bySlot = new Map<number, PopupView[]>();
  for (const p of scene.popups) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
  for (const [slot, list] of bySlot) {
    const tank = scene.tanks.find((t) => t.slot === slot);
    if (!tank) continue;
    const [px, py] = worldToScreen(camera, view, tank.x, tank.y - TANK_RADIUS * 3);
    const ys = stackPopupYs(list, py, reducedMotion);
    list.forEach((p, i) => drawPopupVivid(ctx, p, px, ys[i], reducedMotion));
  }

  drawOuts(ctx, scene);

  // 색보정(비네트·틴트) — 자동 품질 low면 끈다
  if (scene.quality !== "low") drawWorldGrade(ctx, view, worldTheme(scene.mapId));

  // 시안 — 메가탄의 짧은 붉은 틴트
  if (scene.fx?.tint) {
    ctx.fillStyle = `rgba(255, 50, 30, ${0.22 * scene.fx.tint})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

/** 탱크(월드 좌표) — 그림자·차례 고리·탱크 그림. 격파된 탱크도 잔해 연출이 남아 있으면 그린다 */
function drawTanks(ctx: CanvasRenderingContext2D, scene: Scene, scale: number, time: number, reducedMotion: boolean): void {
  const { camera, aim } = scene;
  for (const t of scene.tanks) {
    const anim = scene.tankAnimOf?.(t.slot);
    // 격파된 탱크도 잔해로 남긴다
    if (!t.alive && !(anim && anim.wreck > 0)) continue;
    const angle = aim && aim.slot === t.slot ? aim.angle : (scene.barrelOf?.(t.slot) ?? 60);
    // 땅에 드리운 그림자(해가 오른쪽 위라 왼쪽으로 조금)
    ctx.fillStyle = "rgba(20, 6, 16, 0.45)";
    ctx.beginPath();
    ctx.ellipse(t.x - TANK_RADIUS * scale * 0.35, t.y + 0.5, TANK_RADIUS * scale * 1.6, TANK_RADIUS * scale * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    // 차례 탱크 — 발밑에 빛나는 고리
    if (scene.activeSlot === t.slot) {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
      ctx.lineWidth = 2 / camera.zoom;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y - 1, TANK_RADIUS * scale * 1.7, TANK_RADIUS * scale * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const max = scene.maxHpOf?.(t.slot) ?? 0;
    drawTankArt(ctx, {
      x: t.x,
      y: t.y,
      color: scene.colorOf(t.slot),
      angle: anim ? anim.barrel : angle,
      scale,
      zoom: camera.zoom,
      skin: scene.skinOf?.(t.slot) ?? DEFAULT_TANK_SKIN,
      time,
      anim,
      damage: max > 0 ? 1 - t.hp / max : 0,
      reducedMotion,
      active: scene.activeSlot === t.slot,
    });
  }
}

/** 이름표·HP 막대·차례 화살표(화면 좌표) — 흔들림(sx, sy)을 따라간다 */
function drawTankLabels(ctx: CanvasRenderingContext2D, scene: Scene, scale: number, sx: number, sy: number, time: number, reducedMotion: boolean): void {
  const { camera, view } = scene;
  ctx.textAlign = "center";
  for (const t of scene.tanks) {
    if (!t.alive) continue;
    const [px, py] = worldToScreen(camera, view, t.x + sx / camera.zoom, t.y - TANK_RADIUS * scale * 2.2 - 6 + sy / camera.zoom);
    const max = scene.maxHpOf?.(t.slot) ?? 0;
    const isActive = scene.activeSlot === t.slot;
    const bob = reducedMotion ? 0 : Math.sin(time / 180) * 2;
    if (max > 0) {
      ctx.fillStyle = "rgba(2, 6, 23, 0.75)";
      ctx.fillRect(px - 16, py - 6, 32, 5);
      const k = Math.max(0, Math.min(1, t.hp / max));
      ctx.fillStyle = k > 0.5 ? "#34d399" : k > 0.25 ? "#fbbf24" : "#f87171";
      ctx.fillRect(px - 15, py - 5, 30 * k, 3);
    }
    const label = scene.labelOf?.(t.slot);
    if (label) {
      ctx.font = "bold 11px system-ui, sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
      ctx.strokeText(label, px, py - 10);
      ctx.fillStyle = isActive ? "#fde68a" : "#e2e8f0";
      ctx.fillText(label, px, py - 10);
    }
    if (isActive) {
      const ay = py - (label ? 26 : 12) + bob;
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.moveTo(px - 7, ay - 8);
      ctx.lineTo(px + 7, ay - 8);
      ctx.lineTo(px, ay);
      ctx.fill();
    }
  }
}
