import { interpolatePositions } from './interpolate';
import { BOSS_KINDS, COLORS, DAMAGE_COLORS, ELEMENT_COLORS, ENEMY_COLORS, ENEMY_MARKS, ENEMY_SCALE, MARK, TOWER_COLORS } from './palette';
import { type DamageNumberPool, EFFECT_KIND, type EffectPool, type ParticlePool } from './particles';
import type { RenderEnemy, RenderView } from './renderView';
import { type Viewport, toScreenX, toScreenY } from './viewport';

/**
 * 전경 캔버스 — 매 프레임 지우고 그린다 (§F10 순서: 타워 → 지상 적 → 공중 적 → 투사체 → 파티클 → 데미지 숫자)
 * 성능 원칙: 같은 색·도형은 path 하나로 모아 한 번에 fill · shadowBlur 금지 · save/restore 최소 · fillText는 데미지 숫자만(상한 40)
 * 렌더러는 부동소수·삼각함수 자유(엔진 결정성 규칙 밖) — 포신 방향·걷기 흔들림
 */

/** 크기 (밀리타일) */
const TOWER_BASE_RADIUS = 380;
const ENEMY_RADIUS = 230;
const AIR_LIFT = 260;
const PROJECTILE_RADIUS = 70;
const PARTICLE_SIZE = 90;
const HP_BAR_WIDTH = 520;
const HP_BAR_HEIGHT = 70;

/** 파티클 색 표 — 인덱스 0 = 명중 불꽃, 1~4 = 원소 */
export const PARTICLE_COLORS: readonly string[] = ['#fde68a', ...ELEMENT_COLORS.slice(1)];

export type SceneFrame = {
  prev: RenderView;
  curr: RenderView;
  /** 마지막 틱 이후 진행 비율 0~1 */
  alpha: number;
  particles: ParticlePool;
  numbers: DamageNumberPool;
  showDamageNumbers: boolean;
  /** 연출용 시계 (ms) */
  timeMs: number;
  /** 충격파·번개 (없으면 그리지 않는다 — 측정 화면) */
  effects?: EffectPool;
};

/** 프레임 사이 재사용 버퍼 — 커질 때만 다시 만든다 */
export type SceneScratch = { enemies: Float32Array; projectiles: Float32Array };

export function createSceneScratch(): SceneScratch {
  return { enemies: new Float32Array(512), projectiles: new Float32Array(1024) };
}

/** 적 배열은 id 오름차순 — 포신이 겨눌 표적 인덱스 */
export function findEnemyIndex(list: readonly RenderEnemy[], id: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = list[mid].id;
    if (value === id) return mid;
    if (value < id) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/**
 * 타워 몸 실루엣 (§F10 — 색만으로 구분하지 않는다): 궁수 삼각 지붕 · 대포 원통 · 마법 마름모 수정 · 서리 육각 결정 · 석궁 Y자 · 테슬라 코일
 * 현재 path에 덧붙이기만 한다(같은 종류는 한 번에 fill)
 */
export function traceTowerBody(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number): void {
  switch (kind) {
    case 1: // 대포 — 원통
      ctx.moveTo(cx + r * 0.8, cy);
      ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
      return;
    case 2: // 마법 — 마름모 수정
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.65, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.65, cy);
      ctx.closePath();
      return;
    case 3: // 서리 — 육각 결정
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = cx + Math.cos(a) * r * 0.85;
        const py = cy + Math.sin(a) * r * 0.85;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      return;
    case 4: // 석궁 — Y자
      ctx.moveTo(cx - r * 0.9, cy - r * 0.8);
      ctx.lineTo(cx - r * 0.45, cy - r * 0.8);
      ctx.lineTo(cx, cy - r * 0.15);
      ctx.lineTo(cx + r * 0.45, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.9, cy - r * 0.8);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.1);
      ctx.lineTo(cx + r * 0.25, cy + r * 0.85);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.85);
      ctx.lineTo(cx - r * 0.25, cy + r * 0.1);
      ctx.closePath();
      return;
    case 5: // 테슬라 — 코일(기둥 + 구)
      ctx.rect(cx - r * 0.3, cy - r * 0.2, r * 0.6, r);
      ctx.moveTo(cx + r * 0.45, cy - r * 0.45);
      ctx.arc(cx, cy - r * 0.45, r * 0.45, 0, Math.PI * 2);
      return;
    default: // 궁수 — 삼각 지붕
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
      ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
      ctx.closePath();
  }
}

/** 선택 오버레이 — 슬롯 강조 고리 + 사거리 원(미리보기). 맵 좌표(밀리타일) */
export type SelectionOverlay = { x: number; y: number; range: number };

export function drawSelection(ctx: CanvasRenderingContext2D, selection: SelectionOverlay, viewport: Viewport): void {
  const cx = toScreenX(viewport, selection.x);
  const cy = toScreenY(viewport, selection.y);
  ctx.lineWidth = Math.max(1.5, 50 * viewport.scale);
  ctx.strokeStyle = COLORS.levelPip;
  ctx.beginPath();
  ctx.arc(cx, cy, TOWER_BASE_RADIUS * 1.25 * viewport.scale, 0, Math.PI * 2);
  ctx.stroke();
  if (selection.range <= 0) return;
  ctx.fillStyle = COLORS.rangeFill;
  ctx.strokeStyle = COLORS.rangeEdge;
  ctx.beginPath();
  ctx.arc(cx, cy, selection.range * viewport.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** 누수 경고 — 화면 가장자리 빨간 맥동 (§F8). strength 0~1 */
export function drawLeakPulse(ctx: CanvasRenderingContext2D, viewport: Viewport, strength: number): void {
  if (strength <= 0) return;
  const width = Math.max(4, Math.min(viewport.width, viewport.height) * 0.03);
  ctx.globalAlpha = Math.min(1, strength) * 0.7;
  ctx.strokeStyle = COLORS.hpLow;
  ctx.lineWidth = width;
  ctx.strokeRect(width / 2, width / 2, viewport.width - width, viewport.height - width);
  ctx.globalAlpha = 1;
}

/**
 * 적 몸 실루엣 (§F8 — 색만으로 구분하지 않는다, §F0-4) — 졸개 원 · 질주병 마름모 · 방패병 사각 · 분열체 세 알 · 박쥐 날개 ·
 * 소환사 오각 · 유령 반달(아래가 평평) · 와이번 화살촉 · 사제 십자 · 공성 거인 팔각 · 용 큰 날개 · 새끼 작은 원
 */
function tracePolygon(ctx: CanvasRenderingContext2D, x: number, y: number, sides: number, rotation: number, radius: number): void {
  for (let i = 0; i < sides; i++) {
    const a = rotation + (Math.PI * 2 * i) / sides;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    else ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  ctx.closePath();
}

export function traceEnemyBody(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number): void {
  switch (kind) {
    case 1: // 질주병 — 가로로 긴 마름모
      ctx.moveTo(x + r * 1.15, y);
      ctx.lineTo(x, y - r * 0.7);
      ctx.lineTo(x - r * 1.15, y);
      ctx.lineTo(x, y + r * 0.7);
      ctx.closePath();
      return;
    case 2: // 방패병 — 사각
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      return;
    case 3: // 분열체 — 세 알이 붙은 삼엽(외곽선 하나 — 겹친 원을 따로 그리면 안쪽 호가 테두리로 보인다)
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (Math.PI * 2 * i) / 3;
        const cx = x + Math.cos(a) * r * 0.45;
        const cy = y + Math.sin(a) * r * 0.45;
        if (i === 0) ctx.moveTo(cx + Math.cos(a - Math.PI / 2) * r * 0.5, cy + Math.sin(a - Math.PI / 2) * r * 0.5);
        // 바깥쪽 반원만(중심에서 먼 쪽) — 세 반원이 이어져 하나의 외곽선
        ctx.arc(cx, cy, r * 0.5, a - Math.PI / 2, a + Math.PI / 2);
      }
      ctx.closePath();
      return;
    case 4: // 박쥐 떼 — M자 날개
    case 10: // 용 — 같은 날개(크기는 ENEMY_SCALE)
      ctx.moveTo(x - r * 1.3, y - r * 0.4);
      ctx.lineTo(x - r * 0.4, y + r * 0.1);
      ctx.lineTo(x, y - r * 0.5);
      ctx.lineTo(x + r * 0.4, y + r * 0.1);
      ctx.lineTo(x + r * 1.3, y - r * 0.4);
      ctx.lineTo(x + r * 0.6, y + r * 0.7);
      ctx.lineTo(x, y + r * 0.3);
      ctx.lineTo(x - r * 0.6, y + r * 0.7);
      ctx.closePath();
      return;
    case 5: // 소환사 — 오각
      tracePolygon(ctx, x, y, 5, -Math.PI / 2, r);
      return;
    case 6: // 유령 — 위는 반원, 아래는 평평
      ctx.moveTo(x + r, y + r * 0.6);
      ctx.arc(x, y, r, 0, Math.PI, true);
      ctx.lineTo(x - r, y + r * 0.6);
      ctx.closePath();
      return;
    case 7: // 와이번 — 화살촉
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.7);
      ctx.lineTo(x, y + r * 0.25);
      ctx.lineTo(x - r, y + r * 0.7);
      ctx.closePath();
      return;
    case 8: { // 사제 — 십자(외곽선 하나 — 두 사각을 겹치면 테두리가 가운데에도 그어진다)
      const a = r * 0.3;
      ctx.moveTo(x - a, y - r);
      ctx.lineTo(x + a, y - r);
      ctx.lineTo(x + a, y - a);
      ctx.lineTo(x + r, y - a);
      ctx.lineTo(x + r, y + a);
      ctx.lineTo(x + a, y + a);
      ctx.lineTo(x + a, y + r);
      ctx.lineTo(x - a, y + r);
      ctx.lineTo(x - a, y + a);
      ctx.lineTo(x - r, y + a);
      ctx.lineTo(x - r, y - a);
      ctx.lineTo(x - a, y - a);
      ctx.closePath();
      return;
    }
    case 9: // 공성 거인 — 팔각
      tracePolygon(ctx, x, y, 8, Math.PI / 8, r);
      return;
    default: // 졸개·새끼 — 원
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

/** 적 머리 위 표식 (§F4) — 물리 저항 방패(작은 사각) · 마법 저항 결정(작은 마름모) · 특수 고리. 표식 종류별 한 path */
function drawEnemyMarks(ctx: CanvasRenderingContext2D, view: RenderView, xy: Float32Array, viewport: Viewport, enemyR: number, timeMs: number): void {
  const m = Math.max(2, 70 * viewport.scale);
  const scale = viewport.scale;
  for (const [bit, color] of MARK_STYLE) {
    let any = false;
    for (let i = 0; i < view.enemies.length; i++) {
      const e = view.enemies[i];
      const marks = ENEMY_MARKS[e.kind] ?? 0;
      if (!(marks & bit)) continue;
      if (!any) {
        ctx.beginPath();
        any = true;
      }
      // 표식 자리: 방패 왼쪽 · 결정 가운데 · 특수 오른쪽 (몸 위)
      const ox = bit === MARK.PHYSICAL ? -m * 2.4 : bit === MARK.MAGIC ? 0 : m * 2.4;
      const x = toScreenX(viewport, xy[i * 2]) + ox;
      // 몸과 같이 출렁인다
      const y = toScreenY(viewport, xy[i * 2 + 1]) + enemyWobble(timeMs, e.id, enemyR) - enemyR * (ENEMY_SCALE[e.kind] ?? 1) - m * 3 - (e.air ? AIR_LIFT * scale : 0);
      if (bit === MARK.PHYSICAL) ctx.rect(x - m, y - m, m * 2, m * 2);
      else if (bit === MARK.MAGIC) {
        ctx.moveTo(x, y - m * 1.3);
        ctx.lineTo(x + m, y);
        ctx.lineTo(x, y + m * 1.3);
        ctx.lineTo(x - m, y);
        ctx.closePath();
      } else {
        ctx.moveTo(x + m, y);
        ctx.arc(x, y, m, 0, Math.PI * 2);
      }
    }
    if (!any) continue;
    if (bit === MARK.SPECIAL) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, m * 0.6);
      ctx.stroke();
    } else {
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

const MARK_STYLE: readonly (readonly [number, string])[] = [
  [MARK.PHYSICAL, '#cbd5e1'],
  [MARK.MAGIC, '#a78bfa'],
  [MARK.SPECIAL, '#fde68a'],
];

/** 타워 레벨 표식 (§F4) — Lv4·5 분기 문양(A 삼각·B 사각) · 궁극 쿨다운 고리(주기 궁극이 있는 단계만 — 준비되면 전체, 쿨다운 중이면 찬 만큼) */
function drawTowerMarks(ctx: CanvasRenderingContext2D, view: RenderView, viewport: Viewport, baseR: number): void {
  const badge = Math.max(2, 85 * viewport.scale);
  let any = false;
  for (const t of view.towers) {
    if (t.level < 4) continue;
    if (!any) {
      ctx.fillStyle = COLORS.levelPip;
      ctx.beginPath();
      any = true;
    }
    const x = toScreenX(viewport, t.x) + baseR * 0.85;
    const y = toScreenY(viewport, t.y) - baseR * 0.85;
    if (t.branch === 1) {
      ctx.moveTo(x, y - badge);
      ctx.lineTo(x + badge, y + badge * 0.8);
      ctx.lineTo(x - badge, y + badge * 0.8);
      ctx.closePath();
    } else {
      ctx.rect(x - badge * 0.8, y - badge * 0.8, badge * 1.6, badge * 1.6);
    }
  }
  if (any) ctx.fill();
  // 궁극 — 준비되면 밝은 고리 전체, 쿨다운 중이면 찬 만큼만
  ctx.lineWidth = Math.max(1.5, 55 * viewport.scale);
  ctx.strokeStyle = COLORS.levelPip;
  ctx.beginPath();
  any = false;
  for (const t of view.towers) {
    if (!t.ultimate) continue;
    const ready = 1 - t.ultCooldown / 1000;
    const x = toScreenX(viewport, t.x);
    const y = toScreenY(viewport, t.y);
    const start = -Math.PI / 2;
    ctx.moveTo(x + Math.cos(start) * baseR * 1.18, y + Math.sin(start) * baseR * 1.18);
    ctx.arc(x, y, baseR * 1.18, start, start + Math.PI * 2 * ready);
    any = true;
  }
  if (any) ctx.stroke();
}

/** 충격파 고리(퍼지며 흐려짐)·연쇄 번개(지그재그) — 종류별 한 path */
function drawEffects(ctx: CanvasRenderingContext2D, effects: EffectPool, viewport: Viewport): void {
  const { scale, offsetX, offsetY } = viewport;
  ctx.lineWidth = Math.max(1.5, 45 * viewport.scale);
  ctx.strokeStyle = COLORS.shockwave;
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < effects.count; i++) {
    if (effects.color[i] !== EFFECT_KIND.RING) continue;
    const t = 1 - effects.life[i] / effects.maxLife[i];
    const radius = effects.size[i] * t * scale;
    const cx = offsetX + effects.x[i] * scale;
    const cy = offsetY + effects.y[i] * scale;
    ctx.moveTo(cx + radius, cy);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    any = true;
  }
  if (any) ctx.stroke();
  ctx.strokeStyle = ELEMENT_COLORS[3];
  ctx.beginPath();
  any = false;
  for (let i = 0; i < effects.count; i++) {
    if (effects.color[i] !== EFFECT_KIND.BOLT) continue;
    const x1 = offsetX + effects.x[i] * scale;
    const y1 = offsetY + effects.y[i] * scale;
    const x2 = offsetX + effects.x2[i] * scale;
    const y2 = offsetY + effects.y2[i] * scale;
    const jitter = Math.max(2, Math.hypot(x2 - x1, y2 - y1) * 0.12);
    ctx.moveTo(x1, y1);
    for (let k = 1; k < 4; k++) {
      const f = k / 4;
      ctx.lineTo(x1 + (x2 - x1) * f + (Math.random() - 0.5) * jitter, y1 + (y2 - y1) * f + (Math.random() - 0.5) * jitter);
    }
    ctx.lineTo(x2, y2);
    any = true;
  }
  if (any) ctx.stroke();
}

/** 보스 체력 막대 (§F2 오버레이) — 화면 위쪽 가로 막대 + 이름. 보스가 없으면 그리지 않고 false */
export function drawBossBar(ctx: CanvasRenderingContext2D, viewport: Viewport, view: RenderView, names: readonly string[]): boolean {
  let boss = -1;
  for (let i = 0; i < view.enemies.length; i++) {
    if (BOSS_KINDS.indexOf(view.enemies[i].kind) >= 0) {
      boss = i;
      break;
    }
  }
  if (boss < 0) return false;
  const e = view.enemies[boss];
  const width = viewport.width * 0.7;
  const x = (viewport.width - width) / 2;
  const y = 10;
  const height = 8;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = COLORS.bossHp;
  ctx.fillRect(x, y, width * Math.max(0, e.hp / Math.max(1, e.maxHp)), height);
  ctx.fillStyle = COLORS.damageText;
  ctx.font = BOSS_FONT;
  ctx.textAlign = 'center';
  ctx.fillText(bossLabel(names, e.kind, view.bossPhase), viewport.width / 2, y + height + 14);
  return true;
}

/** 보스 이름 문자열 — 종류·페이즈가 같으면 같은 문자열(매 프레임 새로 만들지 않는다) */
const bossLabels = new Map<number, string>();
function bossLabel(names: readonly string[], kind: number, phase: number): string {
  const key = kind * 4 + phase;
  let label = bossLabels.get(key);
  if (label === undefined) {
    label = `${names[kind] ?? '보스'}${phase === 2 ? ' · 분노' : ''}`;
    bossLabels.set(key, label);
  }
  return label;
}

const BOSS_FONT = '700 12px system-ui, sans-serif';

/** 걷기 흔들림 (§F8 사인 진동) — 몸과 머리 위 표식이 같이 쓴다 */
function enemyWobble(timeMs: number, id: number, enemyR: number): number {
  return Math.sin(timeMs / 120 + id) * enemyR * 0.12;
}

/** 글꼴 문자열 — 크기가 같으면 같은 문자열을 돌려줘 매 프레임 새로 만들지 않는다 */
let cachedFont = { px: -1, value: '' };
function damageFont(scale: number): string {
  const px = Math.max(9, Math.round(260 * scale));
  if (cachedFont.px !== px) cachedFont = { px, value: `700 ${px}px system-ui, sans-serif` };
  return cachedFont.value;
}

export function drawSceneLayer(ctx: CanvasRenderingContext2D, frame: SceneFrame, viewport: Viewport, scratch: SceneScratch): void {
  const { curr, prev, alpha } = frame;
  const { scale, dpr } = viewport;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  scratch.enemies = interpolatePositions(prev.enemies, curr.enemies, alpha, scratch.enemies);
  scratch.projectiles = interpolatePositions(prev.projectiles, curr.projectiles, alpha, scratch.projectiles);
  const enemyXY = scratch.enemies;
  const sx = (x: number) => toScreenX(viewport, x);
  const sy = (y: number) => toScreenY(viewport, y);

  // ---- 타워: 받침 → 몸(종류별 실루엣) → 포신 → 레벨 점 ----
  const baseR = TOWER_BASE_RADIUS * scale;
  ctx.fillStyle = COLORS.slotEdge;
  ctx.beginPath();
  for (const t of curr.towers) {
    ctx.moveTo(sx(t.x) + baseR, sy(t.y));
    ctx.arc(sx(t.x), sy(t.y), baseR, 0, Math.PI * 2);
  }
  ctx.fill();
  // 종류별 한 path — 화면에 없는 종류는 fill하지 않는다(종류가 늘어도 fill 수 = 보이는 종류 수)
  for (let kind = 0; kind < TOWER_COLORS.length; kind++) {
    let any = false;
    for (const t of curr.towers) {
      if (t.kind !== kind) continue;
      if (!any) {
        ctx.fillStyle = TOWER_COLORS[kind];
        ctx.beginPath();
        any = true;
      }
      traceTowerBody(ctx, kind, sx(t.x), sy(t.y), baseR * (0.7 + t.level * 0.06));
    }
    if (any) {
      ctx.fill();
      // 어두운 테두리 — 밝은 받침·흙길 위에서도 실루엣이 또렷하게
      ctx.strokeStyle = COLORS.background;
      ctx.lineWidth = Math.max(1, 40 * scale);
      ctx.stroke();
    }
  }
  ctx.strokeStyle = COLORS.background;
  ctx.lineWidth = Math.max(1.5, 90 * scale);
  ctx.beginPath();
  for (const t of curr.towers) {
    const index = t.targetId ? findEnemyIndex(curr.enemies, t.targetId) : -1;
    if (index < 0) continue;
    const dx = enemyXY[index * 2] - t.x;
    const dy = enemyXY[index * 2 + 1] - t.y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.moveTo(sx(t.x), sy(t.y));
    const reach = TOWER_BASE_RADIUS * 1.1;
    ctx.lineTo(sx(t.x + (dx / len) * reach), sy(t.y + (dy / len) * reach));
  }
  ctx.stroke();
  ctx.fillStyle = COLORS.levelPip;
  ctx.beginPath();
  const pip = Math.max(1, 55 * scale);
  for (const t of curr.towers) {
    for (let l = 0; l < t.level; l++) {
      const px = sx(t.x) + (l - (t.level - 1) / 2) * pip * 2.6;
      const py = sy(t.y) + baseR * 0.95;
      ctx.moveTo(px + pip, py);
      ctx.arc(px, py, pip, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  drawTowerMarks(ctx, curr, viewport, baseR);

  // ---- 적: 지상(원) → 공중(그림자 + 삼각) — 종류별로 한 path ----
  const enemyR = ENEMY_RADIUS * scale;
  for (const air of [false, true]) {
    if (air) {
      ctx.fillStyle = COLORS.shadow;
      ctx.beginPath();
      for (let i = 0; i < curr.enemies.length; i++) {
        if (!curr.enemies[i].air) continue;
        const ex = sx(enemyXY[i * 2]);
        const ey = sy(enemyXY[i * 2 + 1]);
        ctx.moveTo(ex + enemyR, ey);
        ctx.ellipse(ex, ey, enemyR, enemyR * 0.45, 0, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    for (let kind = 0; kind < ENEMY_COLORS.length; kind++) {
      let any = false;
      const r = enemyR * (ENEMY_SCALE[kind] ?? 1);
      for (let i = 0; i < curr.enemies.length; i++) {
        const e = curr.enemies[i];
        if (e.kind !== kind || e.air !== air) continue;
        if (!any) {
          ctx.fillStyle = ENEMY_COLORS[kind];
          ctx.beginPath();
          any = true;
        }
        const ex = sx(enemyXY[i * 2]);
        const ey = sy(enemyXY[i * 2 + 1]) + enemyWobble(frame.timeMs, e.id, enemyR) - (air ? AIR_LIFT * scale : 0);
        traceEnemyBody(ctx, kind, ex, ey, r);
      }
      if (any) {
        ctx.fill();
        ctx.strokeStyle = COLORS.background;
        // 모바일(scale ≈ 0.043)에서 1px 남짓이면 길·겹친 적 위에서 윤곽이 안 보인다 — 2px 이상
        ctx.lineWidth = Math.max(2, 50 * scale);
        ctx.stroke();
      }
    }
  }
  drawEnemyMarks(ctx, curr, enemyXY, viewport, enemyR, frame.timeMs);

  // 체력 막대 — 피해 입은 적만 (§F4): 바탕 → 녹색 → 빨강 세 번의 fill
  const barW = HP_BAR_WIDTH * scale;
  const barH = Math.max(2, HP_BAR_HEIGHT * scale);
  for (const pass of [0, 1, 2]) {
    ctx.fillStyle = pass === 0 ? COLORS.hpBack : pass === 1 ? COLORS.hpFill : COLORS.hpLow;
    ctx.beginPath();
    for (let i = 0; i < curr.enemies.length; i++) {
      const e = curr.enemies[i];
      if (e.hp >= e.maxHp || e.maxHp <= 0) continue;
      const ratio = e.hp / e.maxHp;
      const low = ratio < 0.35;
      if ((pass === 1 && low) || (pass === 2 && !low)) continue;
      const bx = sx(enemyXY[i * 2]) - barW / 2;
      const by = sy(enemyXY[i * 2 + 1]) - enemyR - barH * 2 - (e.air ? AIR_LIFT * scale : 0);
      ctx.rect(bx, by, pass === 0 ? barW : barW * ratio, barH);
    }
    ctx.fill();
  }

  // ---- 투사체: 원소 색(없으면 피해 타입 색)별로 한 path ----
  const projR = Math.max(1.5, PROJECTILE_RADIUS * scale);
  const projXY = scratch.projectiles;
  for (let colorIndex = 1; colorIndex < ELEMENT_COLORS.length + DAMAGE_COLORS.length; colorIndex++) {
    const element = colorIndex < ELEMENT_COLORS.length ? colorIndex : 0;
    const damageType = colorIndex - ELEMENT_COLORS.length;
    let any = false;
    for (let i = 0; i < curr.projectiles.length; i++) {
      const p = curr.projectiles[i];
      if (element ? p.element !== element : p.element !== 0 || p.damageType !== damageType) continue;
      if (!any) {
        ctx.fillStyle = element ? ELEMENT_COLORS[element] : DAMAGE_COLORS[damageType];
        ctx.beginPath();
        any = true;
      }
      const px = sx(projXY[i * 2]);
      const py = sy(projXY[i * 2 + 1]);
      ctx.moveTo(px + projR, py);
      ctx.arc(px, py, projR, 0, Math.PI * 2);
    }
    if (any) ctx.fill();
  }

  if (frame.effects && frame.effects.count > 0) drawEffects(ctx, frame.effects, viewport);

  // ---- 파티클: 가산 합성, 색별 사각형 한 path ----
  const particles = frame.particles;
  if (particles.count > 0) {
    ctx.globalCompositeOperation = 'lighter';
    for (let c = 0; c < PARTICLE_COLORS.length; c++) {
      let any = false;
      for (let i = 0; i < particles.count; i++) {
        if (particles.color[i] !== c) continue;
        if (!any) {
          ctx.fillStyle = PARTICLE_COLORS[c];
          ctx.beginPath();
          any = true;
        }
        const size = PARTICLE_SIZE * scale * (0.4 + 0.6 * (particles.life[i] / particles.maxLife[i]));
        ctx.rect(sx(particles.x[i]) - size / 2, sy(particles.y[i]) - size / 2, size, size);
      }
      if (any) ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- 데미지 숫자 (설정·품질에서 끌 수 있다) ----
  const numbers = frame.numbers;
  if (frame.showDamageNumbers && numbers.count > 0) {
    ctx.fillStyle = COLORS.damageText;
    // 매 프레임 대입한다 — 캔버스 크기를 바꾸면 컨텍스트 상태(글꼴 포함)가 초기화되므로 "이미 넣었음"을 기억하면 안 된다
    ctx.font = damageFont(scale);
    ctx.textAlign = 'center';
    for (let i = 0; i < numbers.count; i++) {
      ctx.fillText(String(numbers.value[i]), sx(numbers.x[i]), sy(numbers.y[i]));
    }
  }
}
