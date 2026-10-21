import { interpolatePositions } from './interpolate';
import { COLORS, DAMAGE_COLORS, ELEMENT_COLORS, ENEMY_COLORS, TOWER_COLORS } from './palette';
import type { DamageNumberPool, ParticlePool } from './particles';
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
};

/** 프레임 사이 재사용 버퍼 — 커질 때만 다시 만든다 */
export type SceneScratch = { enemies: Float32Array; projectiles: Float32Array };

export function createSceneScratch(): SceneScratch {
  return { enemies: new Float32Array(512), projectiles: new Float32Array(1024) };
}

/** 적 배열은 id 오름차순 — 포신이 겨눌 표적 인덱스 */
function findEnemyIndex(list: readonly RenderEnemy[], id: number): number {
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
  for (let kind = 0; kind < TOWER_COLORS.length; kind++) {
    ctx.fillStyle = TOWER_COLORS[kind];
    ctx.beginPath();
    for (const t of curr.towers) {
      if (t.kind !== kind) continue;
      // 궁수탑 = 삼각 지붕 (6종 실루엣은 E2에서 채운다)
      const cx = sx(t.x);
      const cy = sy(t.y);
      const r = baseR * (0.7 + t.level * 0.06);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.87, cy + r * 0.5);
      ctx.lineTo(cx - r * 0.87, cy + r * 0.5);
      ctx.closePath();
    }
    ctx.fill();
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

  // ---- 적: 지상(원) → 공중(그림자 + 삼각) — 종류별로 한 path ----
  const enemyR = ENEMY_RADIUS * scale;
  const wobble = (id: number) => Math.sin(frame.timeMs / 120 + id) * enemyR * 0.12;
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
      ctx.fillStyle = ENEMY_COLORS[kind];
      ctx.beginPath();
      for (let i = 0; i < curr.enemies.length; i++) {
        const e = curr.enemies[i];
        if (e.kind !== kind || e.air !== air) continue;
        const ex = sx(enemyXY[i * 2]);
        const ey = sy(enemyXY[i * 2 + 1]) + wobble(e.id) - (air ? AIR_LIFT * scale : 0);
        if (air) {
          ctx.moveTo(ex, ey - enemyR);
          ctx.lineTo(ex + enemyR, ey + enemyR * 0.6);
          ctx.lineTo(ex - enemyR, ey + enemyR * 0.6);
          ctx.closePath();
        } else {
          ctx.moveTo(ex + enemyR, ey);
          ctx.arc(ex, ey, enemyR, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  }

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
