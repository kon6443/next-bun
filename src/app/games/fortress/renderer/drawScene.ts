/**
 * 한 프레임 그리기 — 배경(하늘·산·구름·바람 줄기) → [흔들림] 지형 레이어(카메라 변환 drawImage) → 탱크 → 이동 계획·조준선 → 탄·꼬리
 * → 폭발·입자 → (화면 좌표) 이름표·HP 막대·피해 숫자·화면 밖 표시
 * 좌표는 월드 px. ctx는 CSS px 기준(setTransform(dpr))으로 받는다
 */

import { TANK_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, cosDeg, sinDeg } from "../engine";
import { type Quality, drawBackdrop } from "./backdrop";
import { type Camera, type ViewSize, worldToScreen } from "./camera";
import { type Effects, drawEffects, shakeOffset } from "./effects";
import type { BlastView, PopupView, ShellView, TankView } from "./playback";
import type { TerrainLayer } from "./terrainLayer";
import { DEFAULT_TANK_SKIN, type TankSkin, type TankSkinId } from "../lib/tankSkins";
import { type Look, usesVivid } from "../lib/look";
import { drawBlastVivid, drawMuzzleShell, drawPopupVivid, drawShellVivid, stackPopupYs, weaponFx } from "./vivid";
import { drawWindLeaves, drawWorldBackdrop, drawWorldGrade, worldTheme } from "./vividWorld";
import type { MapId } from "../engine";
import { type TankAnim, drawTankArt } from "./tankArt";

export const SLOT_COLORS = ["#38bdf8", "#f97316", "#a3e635", "#f472b6"];
export const TEAM_COLORS = ["#38bdf8", "#f97316"];

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
  /** 시안(D-025 B) — 없으면 classic(지금 화면) */
  look?: Look;
  /** 맵(시안 배경·팔레트 테마) */
  mapId?: MapId;
  /** 이번 연출의 무기(엔진 WEAPONS id) — 시안의 무기별 탄·폭발, 없으면 포탄 모양 */
  weaponId?: number;
  /** 지금 차례 탱크가 차례를 받은 시각(time과 같은 시계, ms) — 시안은 처음 잠깐 금빛 고리가 퍼진다 */
  activeSince?: number;
  /** 시안 탱크 애니메이션(slot별) — 없으면 정지 자세 */
  tankAnimOf?: (slot: number) => TankAnim | undefined;
};

const TREAD = "#1f2937";
/** 시안 HUD 잉크(외곽선·아래 두께) — fortressVivid.module.css의 --ink와 같은 색 */
const VIVID_INK = "#160b1c";
const BARREL = "#cbd5e1";
/** Lv2 안테나 — 포신과 다른 색(어두운 은색) */
const ANTENNA = "#94a3b8";
/** 폭발 연출 반지름(월드 px) — 화면에서 최소 BLAST_MIN_PX(작은 무기는 그만큼, 큰 무기는 비례해서 더 크게) */
export const BLAST_MIN_PX = 34;
export function blastDrawRadius(r: number, zoom: number): number {
  return Math.max(r, ((BLAST_MIN_PX / zoom) * r) / 36);
}

/** 보이는 탱크 크기 — 판정 원보다 크게, 멀리 볼수록 더 키워 화면에서 일정 크기 이상(반지름 15px)으로 읽히게(최대 2.4배) */
export function tankDrawScale(zoom: number, vivid = false): number {
  // 시안 — 디테일 있는 탱크라 더 크게(화면에서 반지름 약 20px — 조준 화면(0.9배)에서 폭 약 58px, 멀리 볼 때 최대 4.2배)
  return vivid ? Math.max(1.6, Math.min(4.2, 20 / (TANK_RADIUS * zoom))) : Math.max(1.4, Math.min(2.4, 15 / (TANK_RADIUS * zoom)));
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { camera, view } = scene;
  const time = scene.time ?? 0;
  const reducedMotion = scene.reducedMotion ?? false;
  const vivid = usesVivid(scene.look ?? "classic");
  const backdrop = { time, wind: scene.wind ?? 0, quality: scene.quality ?? "high", reducedMotion };
  if (vivid) drawWorldBackdrop(ctx, view, camera, backdrop, worldTheme(scene.mapId));
  else drawBackdrop(ctx, view, camera, backdrop);

  const [sx, sy] = scene.fx ? shakeOffset(scene.fx, time) : [0, 0];
  ctx.save();
  ctx.translate(view.width / 2 + sx, view.height / 2 + sy);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.cx, -camera.cy);

  // 월드 밖 — 좌우 벽 바깥은 어둡게, 바닥 아래는 암반
  ctx.fillStyle = vivid ? "rgba(30, 10, 30, 0.3)" : "rgba(2, 6, 23, 0.55)";
  ctx.fillRect(-4000, -10000, 4000, 10000 + WORLD_HEIGHT + 4000);
  ctx.fillRect(WORLD_WIDTH, -10000, 4000, 10000 + WORLD_HEIGHT + 4000);
  ctx.fillStyle = "#0b0a12";
  ctx.fillRect(-4000, WORLD_HEIGHT, WORLD_WIDTH + 8000, 4000);

  if (scene.layer) {
    // 시안은 확대해서 볼 때만 부드럽게(흙이 픽셀 덩어리로 보이지 않게) — 멀리 볼 때는 차이가 안 보이고 보간 비용만 크다
    ctx.imageSmoothingEnabled = vivid && camera.zoom > 1.15 && scene.quality !== "low";
    ctx.drawImage(scene.layer.canvas, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }

  const aim = scene.aim;
  const scale = tankDrawScale(camera.zoom, vivid);
  for (const t of scene.tanks) {
    const anim = vivid ? scene.tankAnimOf?.(t.slot) : undefined;
    // 시안은 격파된 탱크도 잔해로 남긴다
    if (!t.alive && !(vivid && anim && anim.wreck > 0)) continue;
    const angle = aim && aim.slot === t.slot ? aim.angle : (scene.barrelOf?.(t.slot) ?? 60);
    // vivid — 땅에 드리운 그림자(해가 오른쪽 위라 왼쪽으로 조금)
    if (vivid) {
      ctx.fillStyle = "rgba(20, 6, 16, 0.45)";
      ctx.beginPath();
      ctx.ellipse(t.x - TANK_RADIUS * scale * 0.35, t.y + 0.5, TANK_RADIUS * scale * 1.6, TANK_RADIUS * scale * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 차례 탱크 — 발밑에 빛나는 고리
    if (scene.activeSlot === t.slot) {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
      ctx.lineWidth = 2 / camera.zoom;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y - 1, TANK_RADIUS * scale * 1.7, TANK_RADIUS * scale * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (vivid) {
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
    } else drawTank(ctx, t.x, t.y, scene.colorOf(t.slot), angle, 1, scale, scene.skinOf?.(t.slot));
  }

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
    if (vivid) drawTankArt(ctx, { x: aim.x, y: aim.y, color: scene.colorOf(aim.slot), angle: aim.angle, scale, zoom: camera.zoom, skin: scene.skinOf?.(aim.slot) ?? DEFAULT_TANK_SKIN, time, alpha: 0.45, reducedMotion: true });
    else drawTank(ctx, aim.x, aim.y, scene.colorOf(aim.slot), aim.angle, 0.45, scale, scene.skinOf?.(aim.slot));
  }

  if (aim?.lastImpact) drawLastImpact(ctx, aim.lastImpact, scene.colorOf(aim.slot), camera.zoom);
  if (aim) {
    if (aim.path && aim.path.length >= 4) drawAimPath(ctx, aim.path, camera.zoom);
    else drawAimGuide(ctx, aim, camera.zoom, scale);
    // 시안 — 포구 앞에 고른 무기의 탄(무기를 바꾸면 모양·색이 바로 바뀐다)
    if (vivid && aim.weaponId !== undefined) {
      const R = TANK_RADIUS * scale;
      const tipX = aim.x + (R * 2.45 * cosDeg(aim.angle)) / 10000;
      const tipY = aim.y - R * 1.15 - (R * 2.45 * sinDeg(aim.angle)) / 10000;
      drawMuzzleShell(ctx, tipX, tipY, aim.angle, camera.zoom, weaponFx(aim.weaponId), time, reducedMotion);
    }
  }

  const wfx = weaponFx(scene.weaponId);
  for (const s of scene.shells) {
    if (vivid) drawShellVivid(ctx, s, camera.zoom, wfx, time, reducedMotion);
    else drawShell(ctx, s, camera.zoom);
  }

  for (const b of scene.blasts) {
    // 멀리 볼 때도 화면에서 일정 크기(반지름 BLAST_MIN_PX) 이상 — 무기 크기 비율은 유지
    // 시안은 첫 프레임부터 크게 터진다(작게 시작해 부풀면 착탄 순간의 한 방이 약하다)
    const r = blastDrawRadius(b.r, camera.zoom) * (vivid ? 0.7 + 0.3 * Math.min(1, b.progress * 3) : 0.4 + 0.6 * Math.min(1, b.progress * 2));
    if (vivid) {
      drawBlastVivid(ctx, b, r, wfx, reducedMotion);
      continue;
    }
    // 불덩이 — 반지름보다 조금 크게 피었다 진다
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 1.25);
    g.addColorStop(0, `rgba(255, 251, 235, ${0.95 * (1 - b.progress)})`);
    g.addColorStop(0.35, `rgba(253, 186, 116, ${0.9 * (1 - b.progress)})`);
    g.addColorStop(0.75, `rgba(234, 88, 12, ${0.6 * (1 - b.progress)})`);
    g.addColorStop(1, "rgba(127, 29, 29, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r * 1.25, 0, Math.PI * 2);
    ctx.fill();
  }
  if (scene.fx) drawEffects(ctx, scene.fx, camera.zoom, (r) => blastDrawRadius(r, camera.zoom) / r);
  // 시안 — 차례를 받은 탱크 둘레에 금빛 고리가 퍼진다(약 0.9초, 움직임 줄이기면 퍼지지 않고 잠깐 고정 고리)
  if (vivid && scene.activeSlot !== null && scene.activeSince !== undefined) {
    const t = scene.tanks.find((x) => x.slot === scene.activeSlot && x.alive);
    const age = time - scene.activeSince;
    if (t && age >= 0 && age < TURN_RING_MS) drawTurnRing(ctx, t.x, t.y - TANK_RADIUS, age / TURN_RING_MS, TANK_RADIUS * scale, camera.zoom, reducedMotion);
  }
  ctx.restore();

  // 시안 — 화면 속 바람(나뭇잎·먼지)
  if (vivid) drawWindLeaves(ctx, view, scene.wind ?? 0, time, scene.mapId, scene.quality ?? "high", reducedMotion);

  // ===== 화면 좌표 =====
  // 이름표·HP 막대 — 배율과 무관한 크기
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

  // 시안 — 화면 밖 칩을 먼저 그려 피해 숫자가 칩에 가리지 않게(classic은 예전 순서)
  if (vivid && scene.offscreenChips !== false) drawOffscreenChips(ctx, scene);

  // 피해 숫자 — 튀어 오르며 커졌다가 사라진다, 큰 피해는 붉게
  // 시안: 같은 탱크에 겹친 숫자(분열탄·3연발·두 단계 폭발)는 먼저 뜬 것을 위로 쌓는다(stackPopupYs — 문구까지 겹치지 않게)
  if (vivid) {
    const bySlot = new Map<number, PopupView[]>();
    for (const p of scene.popups) bySlot.set(p.slot, [...(bySlot.get(p.slot) ?? []), p]);
    for (const [slot, list] of bySlot) {
      const tank = scene.tanks.find((t) => t.slot === slot);
      if (!tank) continue;
      const [px, py] = worldToScreen(camera, view, tank.x, tank.y - TANK_RADIUS * 3);
      const ys = stackPopupYs(list, py, reducedMotion);
      list.forEach((p, i) => drawPopupVivid(ctx, p, px, ys[i], reducedMotion));
    }
  }
  for (const p of vivid ? [] : scene.popups) {
    const tank = scene.tanks.find((t) => t.slot === p.slot);
    if (!tank) continue;
    const [px, py] = worldToScreen(camera, view, tank.x, tank.y - TANK_RADIUS * 3);
    const pop = p.progress < 0.12 ? 0.7 + (p.progress / 0.12) * 0.6 : 1.3 - Math.min(0.3, (p.progress - 0.12) * 1.2);
    const size = Math.round((p.amount >= 30 ? 26 : 20) * pop);
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    const y = py - 18 - p.progress * 34;
    const alpha = p.progress > 0.7 ? (1 - p.progress) / 0.3 : 1;
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(2, 6, 23, ${0.9 * alpha})`;
    ctx.strokeText(`-${p.amount}`, px, y);
    ctx.fillStyle = p.amount >= 30 ? `rgba(248, 113, 113, ${alpha})` : `rgba(253, 224, 71, ${alpha})`;
    ctx.fillText(`-${p.amount}`, px, y);
  }

  if (!vivid && scene.offscreenChips !== false) drawOffscreenChips(ctx, scene);
  drawOuts(ctx, scene);

  // 색보정(비네트·틴트) — 자동 품질 low면 끈다
  if (vivid && scene.quality !== "low") drawWorldGrade(ctx, view, worldTheme(scene.mapId));

  // 시안 — 메가탄의 짧은 붉은 틴트
  if (scene.fx?.tint) {
    ctx.fillStyle = `rgba(255, 50, 30, ${0.22 * scene.fx.tint})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  // 큰 폭발 화면 섬광
  if (scene.fx && scene.fx.flash > 0) {
    ctx.fillStyle = `rgba(255, 247, 214, ${0.55 * scene.fx.flash})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}

/** 차례 시작 고리 길이(ms) */
export const TURN_RING_MS = 900;

/** 차례 시작 고리 — 탱크 둘레에서 금빛 두 겹 고리가 퍼지며 옅어진다(월드 좌표). 움직임 줄이기면 퍼지지 않는 고리가 옅어지기만 */
function drawTurnRing(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, R: number, zoom: number, reducedMotion: boolean): void {
  const fade = 1 - k;
  ctx.save();
  ctx.lineWidth = 3 / Math.max(zoom, 0.5);
  for (let i = 0; i < 2; i++) {
    const kk = Math.max(0, k - i * 0.18);
    const r = reducedMotion ? R * 2.2 : R * (1.4 + kk * 2.6);
    ctx.strokeStyle = `rgba(255, 214, 90, ${(i === 0 ? 0.9 : 0.55) * fade})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** 화면 위 HUD·아래 가장자리 여백(px) — 화면 밖 표시가 HUD에 가리지 않게 */
const CHIP_TOP = 88;
const CHIP_W = 84;
const CHIP_H = 34;

/** 칩 사이 간격(px) — 쌓인 칩의 방향 화살표(칩 밖 11px)가 이웃 칩을 침범하지 않을 만큼. 가로로 이 간격 안이면 같은 쪽으로 묶는다 */
const CHIP_GAP = 12;
/** 한 줄 칩 높이 — 세로가 짧아 두 줄 칩이 다 들어가지 않을 때(이름·HP만, 거리 줄을 뺀다) */
const CHIP_H_COMPACT = 20;

/** faded — 비켜 놓을 자리가 없어 화면 안 탱크 위에 겹친다(반투명으로 그린다) */
export type OffscreenChip = { slot: number; tx: number; ty: number; cx: number; cy: number; compact: boolean; faded?: boolean };

/**
 * 화면 밖 탱크 칩 자리 — 가장자리로 붙인 뒤, 같은 쪽(가로로 칩 너비 + 간격 안에서 이어지는 칩들)끼리 세로로 쌓는다
 * - 탱크 높이 순서대로 위에서 아래로, 바닥을 넘으면 아래에서 위로 되밀고
 * - 두 줄 칩이 다 들어가지 않으면 그 묶음은 한 줄 칩으로 다시 쌓고
 * - 그래도 자리가 모자라면(아주 짧은 화면) 위아래 사이에 고르게 나눠 놓는다(덜 겹치게 — 겹친 채 같은 자리에 두지 않는다)
 * 탱크 위치(tx, ty)는 화살표 방향용으로 그대로 둔다. 순수 함수 — 테스트·그리기가 같이 쓴다
 */
/** 칩 배치 입력 — activeSlot(차례 탱크, 화살표 영역)은 선택 */
type ChipLayoutInput = Pick<Scene, "camera" | "view" | "tanks" | "insetBottom" | "insetSide" | "look"> & { activeSlot?: number | null };

export function offscreenChipLayout(scene: ChipLayoutInput): OffscreenChip[] {
  const { camera, view } = scene;
  const bottom = view.height - (scene.insetBottom ?? 0);
  const range = (h: number) => {
    const minY = CHIP_TOP + h / 2;
    return { minY, maxY: Math.max(minY, bottom - h / 2 - 8) };
  };
  const full = range(CHIP_H);
  const chips: OffscreenChip[] = [];
  for (const t of scene.tanks) {
    if (!t.alive) continue;
    const [tx, ty] = worldToScreen(camera, view, t.x, t.y - TANK_RADIUS);
    if (tx >= 0 && tx <= view.width && ty >= CHIP_TOP - 20 && ty <= bottom) continue;
    const side = scene.insetSide ?? 0;
    const cx = Math.max(side + CHIP_W / 2 + 6, Math.min(view.width - side - CHIP_W / 2 - 6, tx));
    chips.push({ slot: t.slot, tx, ty, cx, cy: Math.max(full.minY, Math.min(full.maxY, ty)), compact: false });
  }
  // 같은 쪽 묶기 — cx 순으로 훑어 앞 칩과 가로 거리가 칩 너비 + 간격 안이면 같은 묶음(화살표까지 닿지 않게)
  const byX = [...chips].sort((a, b) => a.cx - b.cx);
  const groups: OffscreenChip[][] = [];
  for (const chip of byX) {
    const last = groups[groups.length - 1];
    if (last && chip.cx - last[last.length - 1].cx < CHIP_W + CHIP_GAP) last.push(chip);
    else groups.push([chip]);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    const n = group.length;
    const compact = (n - 1) * (CHIP_H + CHIP_GAP) > full.maxY - full.minY;
    const h = compact ? CHIP_H_COMPACT : CHIP_H;
    const step = h + CHIP_GAP;
    const { minY, maxY } = range(h);
    for (const chip of group) {
      chip.compact = compact;
      chip.cy = Math.max(minY, Math.min(maxY, chip.ty));
    }
    group.sort((a, b) => a.cy - b.cy || a.slot - b.slot);
    for (let i = 1; i < n; i++) group[i].cy = Math.max(group[i].cy, group[i - 1].cy + step);
    if (group[n - 1].cy > maxY) {
      group[n - 1].cy = maxY;
      for (let i = n - 2; i >= 0; i--) group[i].cy = Math.min(group[i].cy, group[i + 1].cy - step);
    }
    if (group[0].cy < minY) {
      const even = (maxY - minY) / (n - 1);
      group.forEach((chip, i) => (chip.cy = minY + i * even));
    }
  }
  // 시안만 — classic(되돌리기 경로)은 예전 배치 그대로
  if (usesVivid(scene.look ?? "classic")) avoidOnscreenTanks(scene, chips, range);
  return chips;
}

/**
 * 화면 가장자리의 탱크를 칩이 덮지 않게 — 칩이 화면 안 탱크(몸통 + 위쪽 이름표·HP 막대)와 겹치면 그 탱크 위나 아래(가까운 쪽)로 옮기고,
 * 옮길 자리가 범위 밖이거나 다른 칩과 겹치면 반투명(faded)으로 둔다. 그리기 전용
 */
function avoidOnscreenTanks(scene: ChipLayoutInput, chips: OffscreenChip[], range: (h: number) => { minY: number; maxY: number }): void {
  if (chips.length === 0) return;
  const { camera, view } = scene;
  const bottom = view.height - (scene.insetBottom ?? 0);
  const scale = tankDrawScale(camera.zoom, usesVivid(scene.look ?? "classic"));
  const r = TANK_RADIUS * camera.zoom * scale;
  const boxes: { l: number; r: number; t: number; b: number }[] = [];
  for (const t of scene.tanks) {
    if (!t.alive) continue;
    const [x, y] = worldToScreen(camera, view, t.x, t.y - TANK_RADIUS);
    if (x < 0 || x > view.width || y < CHIP_TOP - 20 || y > bottom) continue;
    // 실제 그리는 자리로 — HP 막대·이름표 기준선(drawScene 이름표와 같은 식) 위로 이름표 글자(약 22px), 차례 탱크는 노란 화살표(약 26px)까지
    const [, labelY] = worldToScreen(camera, view, t.x, t.y - TANK_RADIUS * scale * 2.2 - 6);
    const [, groundY] = worldToScreen(camera, view, t.x, t.y);
    const arrow = t.slot === scene.activeSlot ? 26 : 0;
    const half = Math.max(r * 1.6, 22); // 몸통 또는 이름표 폭 중 넓은 쪽
    boxes.push({ l: x - half, r: x + half, t: labelY - 22 - arrow, b: groundY + Math.max(4, r * 0.35) });
  }
  if (boxes.length === 0) return;
  const rectOf = (c: OffscreenChip, cy = c.cy) => {
    const h = c.compact ? CHIP_H_COMPACT : CHIP_H;
    return { l: c.cx - CHIP_W / 2, r: c.cx + CHIP_W / 2, t: cy - h / 2, b: cy + h / 2 };
  };
  const hit = (a: { l: number; r: number; t: number; b: number }, b: { l: number; r: number; t: number; b: number }) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  for (const chip of chips) {
    const box = boxes.find((b) => hit(rectOf(chip), b));
    if (!box) continue;
    const h = chip.compact ? CHIP_H_COMPACT : CHIP_H;
    const { minY, maxY } = range(h);
    const above = box.t - h / 2 - 4;
    const below = box.b + h / 2 + 4;
    const options = [above, below].filter((y) => y >= minY && y <= maxY).sort((a, b) => Math.abs(a - chip.cy) - Math.abs(b - chip.cy));
    const free = options.find((y) => !boxes.some((b) => hit(rectOf(chip, y), b)) && !chips.some((o) => o !== chip && hit(rectOf(chip, y), rectOf(o))));
    if (free !== undefined) chip.cy = free;
    else chip.faded = true;
  }
}

/** 화면 밖 탱크 — 가장자리에 이름·HP·거리 칩과 방향 화살표(배치는 offscreenChipLayout). 거리는 차례 탱크에서 가로 거리(월드 px ÷ 10 = m) */
function drawOffscreenChips(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const vivid = usesVivid(scene.look ?? "classic");
  const active = scene.tanks.find((t) => t.slot === scene.activeSlot && t.alive);
  for (const chip of offscreenChipLayout(scene)) {
    const t = scene.tanks.find((x) => x.slot === chip.slot) as TankView;
    const { tx, ty, cx, cy, compact } = chip;
    ctx.save();
    // 비켜 놓을 자리가 없으면 반투명 — 아래 탱크가 비쳐 보이게
    if (chip.faded) ctx.globalAlpha = 0.45;
    const h = compact ? CHIP_H_COMPACT : CHIP_H;
    const left = cx - CHIP_W / 2;
    const top = cy - h / 2;
    // 이름·HP 줄 기준선 — 한 줄 칩(높이 20)에서도 이 자리가 가운데
    const line1 = top + 14;
    const radius = compact ? 8 : 10;
    if (vivid) {
      // 시안 HUD와 같은 판 — 아래 두께(잉크) + 남보라 그라데이션 + 잉크 외곽선, 안쪽에 차례 색 테
      ctx.fillStyle = VIVID_INK;
      roundRect(ctx, left, top + 3, CHIP_W, h, radius);
      ctx.fill();
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, "#4a3590");
      g.addColorStop(1, "#2a1d5c");
      ctx.fillStyle = g;
      roundRect(ctx, left, top, CHIP_W, h, radius);
      ctx.fill();
      ctx.strokeStyle = VIVID_INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = scene.colorOf(t.slot);
      ctx.lineWidth = 1.5;
      roundRect(ctx, left + 2.5, top + 2.5, CHIP_W - 5, h - 5, radius - 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
      roundRect(ctx, left, top, CHIP_W, h, radius);
      ctx.fill();
      ctx.strokeStyle = scene.colorOf(t.slot);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // 방향 화살표 — 칩 중심에서 탱크 쪽
    const a = Math.atan2(ty - cy, tx - cx);
    const ax = cx + Math.cos(a) * (CHIP_W / 2 + 4);
    const ay = cy + Math.sin(a) * (h / 2 + 4);
    ctx.fillStyle = scene.colorOf(t.slot);
    ctx.beginPath();
    ctx.moveTo(ax + Math.cos(a) * 7, ay + Math.sin(a) * 7);
    ctx.lineTo(ax + Math.cos(a + 2.4) * 6, ay + Math.sin(a + 2.4) * 6);
    ctx.lineTo(ax + Math.cos(a - 2.4) * 6, ay + Math.sin(a - 2.4) * 6);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.font = "bold 12px system-ui, sans-serif";
    ctx.fillStyle = scene.colorOf(t.slot);
    ctx.fillText(scene.labelOf?.(t.slot) ?? `P${t.slot + 1}`, left + 8, line1);
    ctx.font = vivid ? "bold 11px system-ui, sans-serif" : "11px system-ui, sans-serif";
    ctx.fillStyle = vivid ? "#ffffff" : "#e2e8f0";
    ctx.textAlign = "right";
    ctx.fillText(`HP ${t.hp}`, left + CHIP_W - 8, line1);
    if (!compact && active && active.slot !== t.slot) {
      ctx.fillStyle = vivid ? "#c9bdf0" : "#94a3b8";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.round(Math.abs(t.x - active.x) / 10)}m ${t.x < active.x ? "←" : "→"}`, left + 8, top + 28);
    }
    ctx.textAlign = "center";
    ctx.restore();
  }
}

/** 스킨별 궤도·바퀴·포신 색 */
const SKIN_PARTS: Record<TankSkinId, { tread: string; wheel: string; barrel: string }> = {
  default: { tread: TREAD, wheel: "#64748b", barrel: BARREL },
  desert: { tread: "#4a3726", wheel: "#a8875a", barrel: "#e7d3a4" },
  arctic: { tread: "#334155", wheel: "#e2e8f0", barrel: "#f8fafc" },
  neon: { tread: "#020617", wheel: "", barrel: "" },
};
/** 위장 얼룩 — 차체 안 상대 좌표(R 단위)·반지름 */
const CAMO_SPOTS: readonly [number, number, number][] = [
  [-0.7, -0.85, 0.28],
  [-0.15, -1.02, 0.2],
  [0.45, -0.8, 0.3],
  [0.95, -0.72, 0.16],
  [0.15, -1.32, 0.18],
];

/** 탱크 — 궤도(바퀴)·차체·포탑·포신. (x, y) = 바닥 중앙, 크기는 판정 원(TANK_RADIUS)에 맞춘다. 몸통 색(color)은 slot·팀 색, 스킨은 무늬·장식 */
export function drawTank(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, angle: number, alpha: number, scale: number, skin: TankSkin = DEFAULT_TANK_SKIN): void {
  ctx.globalAlpha = alpha;
  // 바닥 중앙 기준이라 크게 그려도 지형 위에 그대로 선다
  const R = TANK_RADIUS * scale;
  const parts = SKIN_PARTS[skin.id];
  const neon = skin.id === "neon";
  const barrel = neon ? color : parts.barrel;
  // 포신 — 포탑 중심에서 각도 방향
  const tx = x;
  const ty = y - R * 1.15;
  const bx = tx + (R * 1.9 * cosDeg(angle)) / 10000;
  const by = ty - (R * 1.9 * sinDeg(angle)) / 10000;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = barrel;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.lineCap = "butt";

  // 궤도
  ctx.fillStyle = parts.tread;
  roundRect(ctx, x - R * 1.35, y - R * 0.62, R * 2.7, R * 0.62, R * 0.3);
  ctx.fill();
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(x + i * R * 0.8, y - R * 0.31, R * 0.2, 0, Math.PI * 2);
    if (neon) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, R * 0.08);
      ctx.stroke();
    } else {
      ctx.fillStyle = parts.wheel;
      ctx.fill();
    }
  }
  // 차체 — 위가 좁은 사다리꼴 + 포탑. 네온은 어두운 몸통에 slot 색 테두리
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(x - R * 1.25, y - R * 0.6);
    ctx.lineTo(x - R * 0.95, y - R * 1.2);
    ctx.lineTo(x + R * 0.95, y - R * 1.2);
    ctx.lineTo(x + R * 1.25, y - R * 0.6);
    ctx.closePath();
    ctx.moveTo(tx + R * 0.55, ty);
    ctx.arc(tx, ty, R * 0.55, 0, Math.PI, true);
    ctx.closePath();
  };
  if (neon) {
    ctx.fillStyle = "#0b1022";
  } else {
    const g = ctx.createLinearGradient(0, y - R * 1.3, 0, y - R * 0.6);
    g.addColorStop(0, lighten(color));
    g.addColorStop(1, color);
    ctx.fillStyle = g;
  }
  hull();
  ctx.fill();
  // 위장 얼룩 — 차체 안으로 잘라 그린다
  if (skin.id === "desert" || skin.id === "arctic") {
    ctx.save();
    hull();
    ctx.clip();
    // 두 색 얼룩을 번갈아 — 사막은 모래·흙, 설원은 눈·회색
    const tones = skin.id === "desert" ? ["rgba(230, 200, 140, 0.85)", "rgba(110, 76, 40, 0.7)"] : ["rgba(248, 250, 252, 0.9)", "rgba(100, 116, 139, 0.6)"];
    for (const [i, [dx, dy, r]] of CAMO_SPOTS.entries()) {
      ctx.fillStyle = tones[i % 2];
      ctx.beginPath();
      ctx.ellipse(x + dx * R, y + dy * R, r * R * 1.3, r * R, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Lv4 — 차체 가운데 줄무늬(스킨 강조색)
  if (skin.level >= 4) {
    ctx.fillStyle = neon ? color : "rgba(15, 23, 42, 0.55)";
    ctx.fillRect(x - R * 1.08, y - R * 0.92, R * 2.16, R * 0.12);
  }
  hull();
  ctx.strokeStyle = neon ? color : "rgba(2, 6, 23, 0.6)";
  ctx.lineWidth = neon ? Math.max(1.2, R * 0.12) : 1;
  ctx.stroke();
  // Lv2 안테나 · Lv3 깃발(slot 색) — 포탑 뒤쪽(포신 반대편)
  if (skin.level >= 2) {
    const side = cosDeg(angle) >= 0 ? -1 : 1;
    const ax = tx + side * R * 0.35;
    const top = ty - R * 1.25;
    ctx.strokeStyle = ANTENNA;
    ctx.lineWidth = Math.max(0.8, R * 0.07);
    ctx.beginPath();
    ctx.moveTo(ax, ty - R * 0.3);
    ctx.lineTo(ax, top);
    ctx.stroke();
    if (skin.level >= 3) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ax, top);
      ctx.lineTo(ax + side * R * 0.55, top + R * 0.17);
      ctx.lineTo(ax, top + R * 0.34);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = "#e2e8f0";
      ctx.beginPath();
      ctx.arc(ax, top, R * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Lv5 — 포탑의 금색 별
  if (skin.level >= 5) drawStar(ctx, tx, ty - R * 0.26, R * 0.2, "#facc15");
  ctx.globalAlpha = 1;
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** 조준 안내 — 포신 끝에서 점선, 파워가 클수록 길다 */
function drawAimGuide(ctx: CanvasRenderingContext2D, aim: Aim, zoom: number, scale: number): void {
  const R = TANK_RADIUS * scale;
  const ox = aim.x + (R * 1.9 * cosDeg(aim.angle)) / 10000;
  const oy = aim.y - R * 1.15 - (R * 1.9 * sinDeg(aim.angle)) / 10000;
  const len = 26 + aim.power * 0.7;
  const ex = ox + (len * cosDeg(aim.angle)) / 10000;
  const ey = oy - (len * sinDeg(aim.angle)) / 10000;
  ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
  ctx.lineWidth = 3 / zoom;
  ctx.setLineDash([8 / zoom, 6 / zoom]);
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(250, 204, 21, 0.95)";
  ctx.beginPath();
  ctx.arc(ex, ey, 3.5 / zoom, 0, Math.PI * 2);
  ctx.fill();
}

/** 예상 궤적 — 점들이 끝으로 갈수록 흐려진다(끝 = 비행 1/3 지점, 착탄점은 보이지 않는다) */
function drawAimPath(ctx: CanvasRenderingContext2D, path: readonly number[], zoom: number): void {
  const n = path.length / 2;
  // 화면에서 9px 간격 — 틱 샘플이 촘촘해도 점이 뭉치지 않게
  const gap = 9 / zoom;
  let lastX = path[0];
  let lastY = path[1];
  const r = Math.max(1.6, 2.6 / zoom);
  for (let i = 1; i < n; i++) {
    const x = path[i * 2];
    const y = path[i * 2 + 1];
    if (Math.hypot(x - lastX, y - lastY) < gap && i < n - 1) continue;
    lastX = x;
    lastY = y;
    ctx.fillStyle = `rgba(250, 204, 21, ${0.95 - 0.7 * (i / n)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 지난 발 착탄점 — 탱크 색 X와 "지난 발" */
function drawLastImpact(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, color: string, zoom: number): void {
  const k = 7 / zoom;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.lineWidth = 5 / zoom;
  ctx.beginPath();
  ctx.moveTo(p.x - k, p.y - k);
  ctx.lineTo(p.x + k, p.y + k);
  ctx.moveTo(p.x + k, p.y - k);
  ctx.lineTo(p.x - k, p.y + k);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5 / zoom;
  ctx.stroke();
  ctx.font = `600 ${11 / zoom}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 3 / zoom;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.85)";
  ctx.strokeText("지난 발", p.x, p.y - k - 4 / zoom);
  ctx.fillStyle = "#fde68a";
  ctx.fillText("지난 발", p.x, p.y - k - 4 / zoom);
}

/** 탄 — 꼬리(점점 굵고 밝게) + 빛나는 탄 */
function drawShell(ctx: CanvasRenderingContext2D, s: ShellView, zoom: number): void {
  const n = s.trail.length / 2;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    ctx.strokeStyle = `rgba(254, 215, 170, ${0.15 + 0.55 * k})`;
    ctx.lineWidth = (1 + 2.5 * k) / Math.max(zoom, 0.5);
    ctx.beginPath();
    ctx.moveTo(s.trail[i * 2 - 2], s.trail[i * 2 - 1]);
    ctx.lineTo(s.trail[i * 2], s.trail[i * 2 + 1]);
    ctx.stroke();
  }
  const r = Math.max(3, 3.5 / zoom);
  const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3);
  g.addColorStop(0, "rgba(255, 251, 235, 1)");
  g.addColorStop(0.35, "rgba(253, 186, 116, 0.8)");
  g.addColorStop(1, "rgba(251, 146, 60, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** #rrggbb를 조금 밝게 */
function lighten(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const up = (v: number) => Math.min(255, Math.round(v + (255 - v) * 0.35));
  return `rgb(${up((n >> 16) & 255)}, ${up((n >> 8) & 255)}, ${up(n & 255)})`;
}

/** 맵 밖으로 나간 탄 — 나간 자리에서 가장 가까운 화면 가장자리에 OUT */
function drawOuts(ctx: CanvasRenderingContext2D, scene: Scene): void {
  if (!scene.outs?.length) return;
  const { camera, view } = scene;
  const bottom = view.height - (scene.insetBottom ?? 0);
  ctx.font = "900 15px system-ui, sans-serif";
  ctx.textAlign = "center";
  for (const o of scene.outs) {
    const [sx, sy] = worldToScreen(camera, view, o.x, o.y);
    const x = Math.max(34, Math.min(view.width - 34, sx));
    const y = Math.max(CHIP_TOP + 14, Math.min(bottom - 14, sy));
    ctx.fillStyle = "rgba(127, 29, 29, 0.9)";
    roundRect(ctx, x - 28, y - 13, 56, 26, 8);
    ctx.fill();
    ctx.strokeStyle = "#fca5a5";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fee2e2";
    ctx.fillText("OUT", x, y + 5);
  }
}
