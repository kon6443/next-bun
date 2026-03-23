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
  BUBBLE_DURATION,
  BUBBLE_FADE_START,
  BUBBLE_MAX_WIDTH,
  BUBBLE_FONT_SIZE,
  BUBBLE_PADDING,
  BUBBLE_OFFSET_Y,
} from '../config/constants';

/** 말풍선 데이터 */
export interface SpeechBubble {
  text: string;
  createdAt: number; // totalTime 기준
}

/** 뷰포트에 보이는 월드 좌표 범위 */
interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function getViewBounds(camera: Camera, screenWidth: number, screenHeight: number): ViewBounds {
  return {
    left: camera.x,
    right: camera.x + screenWidth,
    top: camera.y,
    bottom: camera.y + screenHeight,
  };
}

// ─── 카메라 ──────────────────────────────────────────────

/** 카메라 위치 계산 (캐릭터 중심, 뷰포트 > 맵이면 센터링) */
export function updateCamera(
  player: Player,
  map: GameMap,
  screenWidth: number,
  screenHeight: number,
): Camera {
  let cx: number;
  let cy: number;

  if (screenWidth >= map.width) {
    // 뷰포트가 맵보다 넓으면 맵을 가운데 배치
    cx = -(screenWidth - map.width) / 2;
  } else {
    cx = Math.max(0, Math.min(player.position.x - screenWidth / 2, map.width - screenWidth));
  }

  if (screenHeight >= map.height) {
    cy = -(screenHeight - map.height) / 2;
  } else {
    cy = Math.max(0, Math.min(player.position.y - screenHeight / 2, map.height - screenHeight));
  }

  return { x: cx, y: cy };
}

// ─── 맵 렌더링 ──────────────────────────────────────────

/** 맵 전체 렌더링 (뷰포트 전체를 채움) */
export function renderMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
  screenWidth: number,
  screenHeight: number,
  time: number,
) {
  const view = getViewBounds(camera, screenWidth, screenHeight);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  renderSky(ctx, map, view, time);
  renderWater(ctx, map, view, time);
  renderShore(ctx, map, view);
  renderGround(ctx, map, view, time);
  renderTrees(ctx, map.waterLineY);
  renderFishingPoints(ctx, map.fishingPoints, time);

  ctx.restore();
}

function renderSky(ctx: CanvasRenderingContext2D, map: GameMap, view: ViewBounds, time: number) {
  const { colors, waterLineY } = map;

  const skyGrad = ctx.createLinearGradient(0, view.top, 0, waterLineY);
  skyGrad.addColorStop(0, '#5b9bd5');
  skyGrad.addColorStop(1, colors.sky);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(view.left, view.top, view.right - view.left, waterLineY - view.top);

  // 구름 (뷰포트 범위에 맞춤)
  const cloudWidth = view.right - view.left + 400;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  const cloudOffset = (time * ANIM_CLOUD_SPEED) % (cloudWidth + 200);
  const cloudBase = view.left - 200;
  drawCloud(ctx, cloudBase + cloudOffset, 50, 60);
  drawCloud(ctx, cloudBase + (cloudOffset + 400) % (cloudWidth + 200), 80, 45);
  drawCloud(ctx, cloudBase + (cloudOffset + 750) % (cloudWidth + 200), 35, 50);
}

function renderWater(ctx: CanvasRenderingContext2D, map: GameMap, view: ViewBounds, time: number) {
  const { colors, waterLineY } = map;

  const waterGrad = ctx.createLinearGradient(0, waterLineY, 0, waterLineY + 80);
  waterGrad.addColorStop(0, colors.water);
  waterGrad.addColorStop(1, colors.waterDeep);
  ctx.fillStyle = waterGrad;
  ctx.fillRect(view.left, waterLineY - 10, view.right - view.left, 80);

  // 반짝임 (뷰포트 전체)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  const sparkleSpan = view.right - view.left;
  for (let i = 0; i < 16; i++) {
    const wx = view.left + ((i * 80 + Math.sin(time * ANIM_WATER_SPARKLE_SPEED + i) * 15) % sparkleSpan);
    const wy = waterLineY + 10 + Math.sin(time * ANIM_WATER_SPARKLE_Y_SPEED + i * 0.7) * 8;
    ctx.beginPath();
    ctx.ellipse(wx, wy, 12 + Math.sin(time + i) * 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderShore(ctx: CanvasRenderingContext2D, map: GameMap, view: ViewBounds) {
  const { colors, waterLineY } = map;

  const shoreGrad = ctx.createLinearGradient(0, waterLineY + 55, 0, waterLineY + 80);
  shoreGrad.addColorStop(0, '#c8b88a');
  shoreGrad.addColorStop(1, colors.ground);
  ctx.fillStyle = shoreGrad;
  ctx.fillRect(view.left, waterLineY + 55, view.right - view.left, 25);
}

function renderGround(ctx: CanvasRenderingContext2D, map: GameMap, view: ViewBounds, time: number) {
  const { colors, waterLineY } = map;

  const groundGrad = ctx.createLinearGradient(0, waterLineY + 80, 0, view.bottom);
  groundGrad.addColorStop(0, colors.ground);
  groundGrad.addColorStop(0.4, colors.groundDark);
  groundGrad.addColorStop(1, '#4a7a2e');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(view.left, waterLineY + 80, view.right - view.left, view.bottom - waterLineY - 80);

  // 풀 디테일 (뷰포트 범위 내만)
  ctx.strokeStyle = colors.grass;
  ctx.lineWidth = 2;
  const grassSpan = view.right - view.left;
  for (let i = 0; i < 40; i++) {
    const gx = view.left + ((i * 42 + 15) % grassSpan);
    const gy = waterLineY + 90 + (i % 5) * 60;
    if (gy < view.bottom && gy > waterLineY + 80) {
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

  ctx.fillStyle = '#ff4444';
  ctx.beginPath();
  const bobberY = state === 'bite' ? y - 45 + Math.sin(time * ANIM_BITE_BOBBER_SPEED) * 4 : y - 45;
  ctx.arc(x + 40 * rodDir, bobberY, 3, 0, Math.PI * 2);
  ctx.fill();
}

// ─── 말풍선 렌더링 ──────────────────────────────────────

/** 캐릭터 머리 위 말풍선 렌더링 */
export function renderSpeechBubble(
  ctx: CanvasRenderingContext2D,
  player: Player,
  camera: Camera,
  bubble: SpeechBubble | null,
  currentTime: number,
) {
  if (!bubble) return;

  const elapsed = currentTime - bubble.createdAt;
  if (elapsed >= BUBBLE_DURATION) return;

  // 페이드아웃 알파
  const alpha = elapsed < BUBBLE_FADE_START
    ? 0.85
    : 0.85 * (1 - (elapsed - BUBBLE_FADE_START) / (BUBBLE_DURATION - BUBBLE_FADE_START));

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  const { x, y } = player.position;
  const bubbleY = y - player.height / 2 - BUBBLE_OFFSET_Y;

  ctx.font = `${BUBBLE_FONT_SIZE}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 텍스트 줄바꿈 처리
  const lines = wrapText(ctx, bubble.text, BUBBLE_MAX_WIDTH - BUBBLE_PADDING * 2);
  const lineHeight = BUBBLE_FONT_SIZE + 3;
  const textHeight = lines.length * lineHeight;
  const textWidth = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + BUBBLE_PADDING * 2,
  );

  const boxW = textWidth;
  const boxH = textHeight + BUBBLE_PADDING * 2;
  const boxX = x - boxW / 2;
  const boxY = bubbleY - boxH;

  // 말풍선 배경 (둥근 사각형)
  ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.8})`;
  roundRect(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.fill();

  // 테두리
  ctx.strokeStyle = `rgba(148, 163, 184, ${alpha * 0.4})`;
  ctx.lineWidth = 1;
  roundRect(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.stroke();

  // 꼬리 (삼각형)
  ctx.fillStyle = `rgba(15, 23, 42, ${alpha * 0.8})`;
  ctx.beginPath();
  ctx.moveTo(x - 5, boxY + boxH);
  ctx.lineTo(x, boxY + boxH + 6);
  ctx.lineTo(x + 5, boxY + boxH);
  ctx.closePath();
  ctx.fill();

  // 텍스트
  ctx.fillStyle = `rgba(226, 232, 240, ${alpha})`;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, boxY + BUBBLE_PADDING + lineHeight * (i + 0.5));
  }

  ctx.restore();
}

/** 텍스트를 maxWidth에 맞게 줄바꿈 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const char of text) {
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current.length > 0) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [''];
}

// ─── 다른 플레이어 렌더링 ─────────────────────────────────

/** OtherPlayer와 동일한 최소 타입 (순환 import 방지) */
interface OtherPlayerRender {
  userId: number;
  userName: string;
  x: number;
  y: number;
  direction: 'left' | 'right';
  fishingState?: string;
}

/** 다른 플레이어들을 캔버스에 렌더링 */
export function renderOtherPlayers(
  ctx: CanvasRenderingContext2D,
  players: OtherPlayerRender[],
  camera: Camera,
  time: number,
) {
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  for (const p of players) {
    renderOtherPlayer(ctx, p, time);
  }

  ctx.restore();
}

function renderOtherPlayer(
  ctx: CanvasRenderingContext2D,
  p: OtherPlayerRender,
  time: number,
) {
  const pw = 24;
  const ph = 36;
  const bodyTop = p.y - ph / 2;

  // 그림자
  ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + ph / 2 + 2, pw / 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 반투명 효과 (다른 유저임을 구분)
  ctx.globalAlpha = 0.8;

  // 몸통 (다른 색상 — 녹색 계열)
  ctx.fillStyle = '#5ab06a';
  roundRect(ctx, p.x - pw / 2, bodyTop + 10, pw, ph - 10, 4);
  ctx.fill();

  // 머리
  ctx.fillStyle = '#ffd4a0';
  ctx.beginPath();
  ctx.arc(p.x, bodyTop + 8, 10, 0, Math.PI * 2);
  ctx.fill();

  // 눈
  ctx.fillStyle = '#333';
  if (p.direction === 'left') {
    ctx.beginPath();
    ctx.arc(p.x - 4, bodyTop + 6, 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(p.x + 4, bodyTop + 6, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 다리
  ctx.fillStyle = '#3a3a5c';
  ctx.fillRect(p.x - 6, p.y + ph / 2 - 4, 5, 8);
  ctx.fillRect(p.x + 1, p.y + ph / 2 - 4, 5, 8);

  // 낚시 중이면 낚싯대 표시
  if (p.fishingState && p.fishingState !== 'idle') {
    const rodDir = p.direction === 'left' ? -1 : 1;
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + 8 * rodDir, bodyTop + 15);
    const tipWobble = p.fishingState === 'bite' ? Math.sin(time * ANIM_BITE_ROD_WOBBLE_SPEED) * 5 : 0;
    ctx.lineTo(p.x + 35 * rodDir, bodyTop + 15 - 25 + tipWobble);
    ctx.stroke();

    // 줄 + 찌
    if (p.fishingState === 'waiting' || p.fishingState === 'bite' || p.fishingState === 'challenge') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + 35 * rodDir, bodyTop + 15 - 25);
      ctx.lineTo(p.x + 40 * rodDir, bodyTop + 15 - 45);
      ctx.stroke();

      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(p.x + 40 * rodDir, bodyTop + 15 - 45, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1.0;

  // 이름표
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const nameWidth = ctx.measureText(p.userName).width + 8;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  roundRect(ctx, p.x - nameWidth / 2, bodyTop - 18, nameWidth, 14, 4);
  ctx.fill();

  ctx.fillStyle = '#a5f3fc';
  ctx.fillText(p.userName, p.x, bodyTop - 5);
}

// ─── 공용 렌더링 유틸 ───────────────────────────────────

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
