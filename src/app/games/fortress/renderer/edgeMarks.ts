import { TANK_RADIUS } from "../engine";
import type { TankView } from "./playback";
import { worldToScreen } from "./camera";
import type { Scene } from "./drawScene";
import { tankDrawScale } from "./scale";
import { INK } from "./color";

/** 화면 가장자리 표시(화면 좌표) — 화면 밖 탱크 칩(배치·그리기)·맵 밖으로 나간 탄 OUT */


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
type ChipLayoutInput = Pick<Scene, "camera" | "view" | "tanks" | "insetBottom" | "insetSide"> & { activeSlot?: number | null };

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
  avoidOnscreenTanks(scene, chips, range);
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
  const scale = tankDrawScale(camera.zoom);
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
export function drawOffscreenChips(ctx: CanvasRenderingContext2D, scene: Scene): void {
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
    // 시안 HUD와 같은 판 — 아래 두께(잉크) + 남보라 그라데이션 + 잉크 외곽선, 안쪽에 차례 색 테
    ctx.fillStyle = INK;
    roundRect(ctx, left, top + 3, CHIP_W, h, radius);
    ctx.fill();
    const g = ctx.createLinearGradient(0, top, 0, top + h);
    g.addColorStop(0, "#4a3590");
    g.addColorStop(1, "#2a1d5c");
    ctx.fillStyle = g;
    roundRect(ctx, left, top, CHIP_W, h, radius);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.strokeStyle = scene.colorOf(t.slot);
    ctx.lineWidth = 1.5;
    roundRect(ctx, left + 2.5, top + 2.5, CHIP_W - 5, h - 5, radius - 2);
    ctx.stroke();
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
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(`HP ${t.hp}`, left + CHIP_W - 8, line1);
    if (!compact && active && active.slot !== t.slot) {
      ctx.fillStyle = "#c9bdf0";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.round(Math.abs(t.x - active.x) / 10)}m ${t.x < active.x ? "←" : "→"}`, left + 8, top + 28);
    }
    ctx.textAlign = "center";
    ctx.restore();
  }
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

/** 맵 밖으로 나간 탄 — 나간 자리에서 가장 가까운 화면 가장자리에 OUT */
export function drawOuts(ctx: CanvasRenderingContext2D, scene: Scene): void {
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
