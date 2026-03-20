import type { GameMap, Position, Camera, FishingState } from '../types/game';
import type { Player } from '../types/player';
import {
  ANIM_CLOUD_SPEED,
  ANIM_WATER_SPARKLE_SPEED,
  ANIM_WATER_SPARKLE_Y_SPEED,
  ANIM_GRASS_SWAY_SPEED,
  ANIM_FISHING_POINT_PULSE_SPEED,
  ANIM_WALK_BOB_SPEED,
  ANIM_BITE_ROD_WOBBLE_SPEED,
  ANIM_BITE_LINE_WOBBLE_SPEED,
  ANIM_BITE_BOBBER_SPEED,
} from '../config/constants';

// ─── 카메라 ──────────────────────────────────────────────

/** 카메라 위치 계산 (캐릭터 중심, 맵 경계 클램핑) */
export function updateCamera(
  player: Player,
  map: GameMap,
  screenWidth: number,
  screenHeight: number,
): Camera {
  return {
    x: Math.max(0, Math.min(player.position.x - screenWidth / 2, map.width - screenWidth)),
    y: Math.max(0, Math.min(player.position.y - screenHeight / 2, map.height - screenHeight)),
  };
}

// ─── 맵 렌더링 ──────────────────────────────────────────

/** 맵 전체 렌더링 (카메라 transform 포함) */
export function renderMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
  time: number,
) {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  renderSky(ctx, map, time);
  renderWater(ctx, map, time);
  renderShore(ctx, map);
  renderGround(ctx, map, time);
  renderTrees(ctx, map.waterLineY);
  renderFishingPoints(ctx, map.fishingPoints, time);

  ctx.restore();
}

function renderSky(ctx: CanvasRenderingContext2D, map: GameMap, time: number) {
  const { colors, waterLineY, width } = map;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, waterLineY);
  skyGrad.addColorStop(0, '#5b9bd5');
  skyGrad.addColorStop(1, colors.sky);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, waterLineY);

  // 구름
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  const cloudOffset = (time * ANIM_CLOUD_SPEED) % (width + 200);
  drawCloud(ctx, cloudOffset - 100, 50, 60);
  drawCloud(ctx, (cloudOffset + 400) % (width + 200) - 100, 80, 45);
  drawCloud(ctx, (cloudOffset + 750) % (width + 200) - 100, 35, 50);
}

function renderWater(ctx: CanvasRenderingContext2D, map: GameMap, time: number) {
  const { colors, waterLineY, width } = map;

  const waterGrad = ctx.createLinearGradient(0, waterLineY, 0, waterLineY + 80);
  waterGrad.addColorStop(0, colors.water);
  waterGrad.addColorStop(1, colors.waterDeep);
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, waterLineY - 10, width, 80);

  // 반짝임
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  for (let i = 0; i < 12; i++) {
    const wx = (i * 100 + Math.sin(time * ANIM_WATER_SPARKLE_SPEED + i) * 15) % width;
    const wy = waterLineY + 10 + Math.sin(time * ANIM_WATER_SPARKLE_Y_SPEED + i * 0.7) * 8;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 12 + Math.sin(time + i) * 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderShore(ctx: CanvasRenderingContext2D, map: GameMap) {
  const { colors, waterLineY, width } = map;

  const shoreGrad = ctx.createLinearGradient(0, waterLineY + 55, 0, waterLineY + 80);
  shoreGrad.addColorStop(0, '#c8b88a');
  shoreGrad.addColorStop(1, colors.ground);
  ctx.fillStyle = shoreGrad;
  ctx.fillRect(0, waterLineY + 55, width, 25);
}

function renderGround(ctx: CanvasRenderingContext2D, map: GameMap, time: number) {
  const { colors, waterLineY, width, height } = map;

  const groundGrad = ctx.createLinearGradient(0, waterLineY + 80, 0, height);
  groundGrad.addColorStop(0, colors.ground);
  groundGrad.addColorStop(0.4, colors.groundDark);
  groundGrad.addColorStop(1, '#4a7a2e');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, waterLineY + 80, width, height - waterLineY - 80);

  // 풀 디테일
  ctx.strokeStyle = colors.grass;
  ctx.lineWidth = 2;
  for (let i = 0; i < 30; i++) {
    const gx = (i * 42 + 15) % width;
    const gy = waterLineY + 90 + (i % 5) * 60;
    if (gy < height - 20) {
      drawGrass(ctx, gx, gy, time, i);
    }
  }
}

function renderTrees(ctx: CanvasRenderingContext2D, waterLineY: number) {
  drawTree(ctx, 80, waterLineY + 100, 1);
  drawTree(ctx, 550, waterLineY + 120, 0.8);
  drawTree(ctx, 1000, waterLineY + 90, 1.1);
}

function renderFishingPoints(
  ctx: CanvasRenderingContext2D,
  points: GameMap['fishingPoints'],
  time: number,
) {
  for (const point of points) {
    renderFishingPointGlow(ctx, point.position, point.radius, time);
  }
}

// ─── 장식 요소 (private) ────────────────────────────────

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.15, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawGrass(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, seed: number) {
  const sway = Math.sin(time * ANIM_GRASS_SWAY_SPEED + seed * 0.5) * 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + sway - 3, y - 12, x + sway - 2, y - 18);
  ctx.moveTo(x + 4, y);
  ctx.quadraticCurveTo(x + 4 + sway + 2, y - 10, x + 4 + sway + 3, y - 15);
  ctx.stroke();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(x - 6 * scale, y - 30 * scale, 12 * scale, 40 * scale);

  ctx.fillStyle = '#3a7a2a';
  ctx.beginPath();
  ctx.arc(x, y - 45 * scale, 25 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#4a8a3a';
  ctx.beginPath();
  ctx.arc(x - 10 * scale, y - 35 * scale, 18 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 12 * scale, y - 38 * scale, 16 * scale, 0, Math.PI * 2);
  ctx.fill();
}

function renderFishingPointGlow(
  ctx: CanvasRenderingContext2D,
  pos: Position,
  radius: number,
  time: number,
) {
  const pulse = 0.5 + Math.sin(time * ANIM_FISHING_POINT_PULSE_SPEED) * 0.3;

  ctx.fillStyle = `rgba(255, 215, 0, ${pulse * 0.25})`;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(255, 255, 100, ${pulse * 0.6})`;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

// ─── 플레이어 렌더링 ────────────────────────────────────

/** 플레이어 + 낚싯대 렌더링 */
export function renderPlayer(
  ctx: CanvasRenderingContext2D,
  player: Player,
  camera: Camera,
  fishingState: FishingState,
  time: number,
) {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  const { position, direction, isMoving, width: pw, height: ph } = player;
  const { x, y } = position;
  const bobY = isMoving ? Math.sin(time * ANIM_WALK_BOB_SPEED) * 2 : 0;
  const bodyTop = y - ph / 2 + bobY;

  renderPlayerShadow(ctx, x, y, pw, ph);
  renderPlayerBody(ctx, x, bodyTop, pw, ph);
  renderPlayerHead(ctx, x, bodyTop, direction);

  if (fishingState !== 'idle') {
    renderFishingRod(ctx, x, bodyTop + 15, direction, fishingState, time);
  }

  renderPlayerLegs(ctx, x, y + ph / 2 - 4, bobY, isMoving, time);

  ctx.restore();
}

function renderPlayerShadow(ctx: CanvasRenderingContext2D, x: number, y: number, pw: number, ph: number) {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(x, y + ph / 2 + 2, pw / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function renderPlayerBody(ctx: CanvasRenderingContext2D, x: number, bodyTop: number, pw: number, ph: number) {
  ctx.fillStyle = '#4a90d9';
  roundRect(ctx, x - pw / 2, bodyTop + 10, pw, ph - 10, 4);
  ctx.fill();
}

function renderPlayerHead(ctx: CanvasRenderingContext2D, x: number, bodyTop: number, direction: string) {
  ctx.fillStyle = '#ffd4a0';
  ctx.beginPath();
  ctx.arc(x, bodyTop + 8, 10, 0, Math.PI * 2);
  ctx.fill();

  // 눈
  ctx.fillStyle = '#333';
  if (direction === 'left') {
    ctx.beginPath();
    ctx.arc(x - 4, bodyTop + 6, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (direction === 'right') {
    ctx.beginPath();
    ctx.arc(x + 4, bodyTop + 6, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x - 3, bodyTop + 6, 1.5, 0, Math.PI * 2);
    ctx.arc(x + 3, bodyTop + 6, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderPlayerLegs(
  ctx: CanvasRenderingContext2D,
  x: number,
  legTop: number,
  bobY: number,
  isMoving: boolean,
  time: number,
) {
  ctx.fillStyle = '#3a3a5c';
  if (isMoving) {
    const legSwing = Math.sin(time * ANIM_WALK_BOB_SPEED) * 5;
    ctx.fillRect(x - 6, legTop + bobY, 5, 8);
    ctx.fillRect(x + 1, legTop + bobY - legSwing * 0.3, 5, 8);
  } else {
    ctx.fillRect(x - 6, legTop, 5, 8);
    ctx.fillRect(x + 1, legTop, 5, 8);
  }
}

// ─── 낚싯대 렌더링 ──────────────────────────────────────

function renderFishingRod(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: string,
  state: FishingState,
  time: number,
) {
  const rodDir = direction === 'left' ? -1 : 1;

  ctx.strokeStyle = '#8B4513';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 8 * rodDir, y);

  if (state === 'casting') {
    const angle = Math.min(time * 5, 1) * 0.8;
    ctx.lineTo(x + 8 * rodDir + Math.cos(-angle) * 40 * rodDir, y - Math.sin(angle) * 40);
  } else {
    const tipWobble = state === 'bite' ? Math.sin(time * ANIM_BITE_ROD_WOBBLE_SPEED) * 5 : 0;
    ctx.lineTo(x + 35 * rodDir, y - 25 + tipWobble);
  }
  ctx.stroke();

  // 낚싯줄 + 찌
  const hasLine = state === 'waiting' || state === 'bite' || state === 'challenge';
  if (hasLine) {
    renderFishingLine(ctx, x, y, rodDir, state, time);
  }
}

function renderFishingLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rodDir: number,
  state: FishingState,
  time: number,
) {
  const lineWobble = state === 'bite' ? Math.sin(time * ANIM_BITE_LINE_WOBBLE_SPEED) * 3 : 0;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 35 * rodDir, y - 25);
  ctx.lineTo(x + 40 * rodDir + lineWobble, y - 45);
  ctx.stroke();

  // 찌
  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  const bobberY = state === 'bite' ? y - 45 + Math.sin(time * ANIM_BITE_BOBBER_SPEED) * 4 : y - 45;
  ctx.arc(x + 40 * rodDir, bobberY, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ─── 공용 렌더링 유틸 ───────────────────────────────────

/** 둥근 사각형 path 생성 (fill/stroke는 호출측에서) */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
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
