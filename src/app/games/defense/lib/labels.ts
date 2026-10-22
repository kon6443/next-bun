/**
 * 화면 문구 — 타워·적 이름 (인덱스 = TOWER_ID · ENEMY_ID, defense DESIGN §C4·§C5·§L2)
 * 엔진을 import하지 않는다(허브·스테이지 화면 번들에 엔진·데이터가 들어가지 않게 — §F10)
 */

export const TOWER_NAMES: readonly string[] = ['궁수탑', '대포', '마법탑', '서리탑', '대공 석궁', '테슬라'];

/** 한 줄 역할 — 링 메뉴 미리보기 설명 */
export const TOWER_ROLES: readonly string[] = [
  '빠른 단일 공격 · 지상·공중',
  '느린 범위 폭발 · 지상만',
  '마법 피해 · 방패병에 강함',
  '감속 · 범위 제어',
  '공중 특화 · 지상 약함',
  '연쇄 번개 · 대군',
];

export const ENEMY_NAMES: readonly string[] = [
  '졸개',
  '질주병',
  '방패병',
  '분열체',
  '박쥐 떼',
  '소환사',
  '유령',
  '와이번',
  '사제',
  '공성 거인',
  '용',
  '분열체 새끼',
];

/** 타게팅 모드 (인덱스 = TARGET) — 선두 → 후미 → 최강 → 최근접 순환 (§F3) */
export const TARGET_NAMES: readonly string[] = ['선두', '후미', '최강', '최근접'];

export const DIFFICULTY_NAMES = { easy: '쉬움', normal: '보통', hard: '어려움' } as const;

/** 적 한 줄 특징 — 도감·브리핑 (§C5) */
export const ENEMY_TRAITS: readonly string[] = [
  '가장 기본 적',
  '빠르게 달린다',
  '물리 피해에 강하다 — 마법으로',
  '쓰러지면 새끼 셋으로 갈라진다',
  '공중 · 떼로 온다 — 대공 석궁·궁수탑·테슬라로',
  '중간 보스 · 졸개를 불러낸다',
  '물리 피해를 거의 막는다 — 마법·테슬라로',
  '공중 · 빠르다',
  '주변 적을 치유한다 — 먼저 노려요',
  '엘리트 · 아주 단단하다',
  '최종 보스 · 공중 · 반쯤 다치면 저항이 바뀌고 박쥐를 부른다',
  '분열체가 갈라져 나온 작은 적',
];
