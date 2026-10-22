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
  /** 사거리 미리보기 */
  rangeFill: 'rgba(253, 230, 138, 0.10)',
  rangeEdge: 'rgba(253, 230, 138, 0.55)',
} as const;

/**
 * 적 종류별 몸 색 — 인덱스 = ENEMY_ID
 * 졸개 · 질주병 · 방패병 · 분열체 · 박쥐 떼 · 소환사 · 유령 · 와이번 · 사제 · 공성 거인 · 용 · 분열체 새끼
 */
export const ENEMY_COLORS: readonly string[] = [
  '#e2e8f0', '#fca5a5', '#94a3b8', '#86efac', '#c4b5fd', '#f0abfc', '#bae6fd', '#fdba74', '#fef08a', '#a8a29e', '#f87171', '#bbf7d0',
];
/** 적 종류별 크기 배율 — 엘리트(공성 거인) 1.4 · 보스(소환사·용) 2 · 새끼 0.6 (§F8 보스는 2~3배) */
export const ENEMY_SCALE: readonly number[] = [1, 0.9, 1.1, 1, 0.6, 2, 1, 1, 1, 1.4, 2, 0.6];
/** 타워 종류별 몸 색 — 인덱스 = TOWER_ID (궁수 · 대포 · 마법 · 서리 · 석궁 · 테슬라) */
export const TOWER_COLORS: readonly string[] = ['#fbbf24', '#cbd5e1', '#a78bfa', '#67e8f9', '#f472b6', '#facc15'];
