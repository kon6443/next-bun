/**
 * 렌더러가 읽는 화면 상태 — 엔진 내부 구조 대신 이 타입만 본다(defense DESIGN §E8·§F10, 타입 소유 = renderer)
 * 엔진 버전마다 어댑터(lib/toRenderView)가 이 모양으로 옮겨 담는다 → 구버전 리플레이도 렌더러 하나로 그린다
 * 좌표는 모두 밀리타일(1칸 = 1000), 화면 변환·보간은 렌더러 몫(부동소수 자유)
 */

export type RenderEnemy = {
  /** 생성 순번 — 프레임 사이 보간의 키 */
  id: number;
  kind: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 상태효과 비트 (EFFECT_BIT) — E1은 항상 0 */
  effects: number;
  air: boolean;
};

export type RenderTower = {
  id: number;
  slot: number;
  kind: number;
  level: number;
  /** 0 = 분기 전, 1·2 = Lv4 분기 */
  branch: number;
  x: number;
  y: number;
  /** 포신 방향 — 마지막으로 겨눈 적 id (0 = 없음, 이미 사라졌을 수 있다) */
  targetId: number;
  /** 궁극 쿨다운 남은 비율 ‰ (0 = 준비됨·궁극 없음) — E1은 항상 0 */
  ultCooldown: number;
};

export type RenderProjectile = {
  id: number;
  x: number;
  y: number;
  element: number;
  damageType: number;
};

export type RenderView = {
  tick: number;
  enemies: RenderEnemy[];
  towers: RenderTower[];
  projectiles: RenderProjectile[];
  /** 보스 페이즈 (0 = 보스 없음) — E1은 항상 0 */
  bossPhase: number;
};

/** 정적 맵 — 배경 캔버스에 한 번 그린다 */
export type RenderMap = {
  width: number;
  height: number;
  /** 경로마다 [x0, y0, x1, y1, ...] */
  groundPaths: readonly (readonly number[])[];
  airPaths: readonly (readonly number[])[];
  slots: readonly { x: number; y: number }[];
};

/** 상태효과 비트 — E2에서 채운다 */
export const EFFECT_BIT = {
  SLOW: 1,
  STUN: 2,
  BURN: 4,
  POISON: 8,
  SHRED: 16,
  VULNERABLE: 32,
} as const;

export function createRenderView(): RenderView {
  return { tick: 0, enemies: [], towers: [], projectiles: [], bossPhase: 0 };
}
