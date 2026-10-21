/**
 * 렌더 색 — 원소·피해 타입 색은 defense DESIGN §F4·§F10. 배경은 차분하게, 전투 요소는 채도 높게(시선이 전투로)
 * 색만으로 구분하지 않는다(§F0-4) — 타워·적은 실루엣도 다르다(sceneLayer)
 */

/** 인덱스 = ELEMENT (없음·불·얼음·번개·독) — 없음은 피해 타입 색을 쓴다 */
export const ELEMENT_COLORS: readonly string[] = ['', '#f97316', '#67e8f9', '#facc15', '#84cc16'];

/** 인덱스 = DAMAGE (물리·마법·고정) */
export const DAMAGE_COLORS: readonly string[] = ['#cbd5e1', '#a78bfa', '#84cc16'];

export const COLORS = {
  /** 바깥 여백 — slate-950 */
  background: '#020617',
  /** 맵 바닥 */
  ground: '#0b1324',
  groundGrid: '#111c33',
  /** 흙길 */
  path: '#4a3d2c',
  pathEdge: '#2b2419',
  /** 돌 받침 슬롯 */
  slot: '#334155',
  slotEdge: '#64748b',
  hpBack: '#0f172a',
  hpFill: '#22c55e',
  hpLow: '#ef4444',
  shadow: 'rgba(2, 6, 23, 0.55)',
  levelPip: '#fde68a',
  damageText: '#fef3c7',
} as const;

/** 적 종류별 몸 색 — 인덱스 = ENEMY_ID */
export const ENEMY_COLORS: readonly string[] = ['#e2e8f0'];
/** 타워 종류별 몸 색 — 인덱스 = TOWER_ID */
export const TOWER_COLORS: readonly string[] = ['#fbbf24'];
