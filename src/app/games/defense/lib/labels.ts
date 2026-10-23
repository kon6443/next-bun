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

/** 증강 희귀도 (인덱스 = RARITY: 일반·희귀·전설, §F6 테두리 회색·파랑·금색) */
export const RARITY_NAMES: readonly string[] = ['일반', '희귀', '전설'];

/** 증강 카드 (인덱스 = 카드 id, 엔진 data/augments.ts 순서·§L10) — 이름 · 한 줄 효과 */
export const AUGMENT_TEXT: readonly { name: string; desc: string }[] = [
  { name: '날카로운 촉', desc: '궁수탑 피해 +25%' },
  { name: '세 번째 화살', desc: '궁수탑 3발째마다 화살이 2명을 더 관통' },
  { name: '큰 화약통', desc: '대포 폭발 범위 +30%' },
  { name: '여진', desc: '대포 착탄 지점이 1초 동안 적을 30% 감속' },
  { name: '마력 증폭', desc: '마법탑 피해 +25%' },
  { name: '공명', desc: '마법탑 공격이 근처 두 번째 적에게 50% 피해' },
  { name: '혹한', desc: '모든 감속 효과 +10%p' },
  { name: '서리 파쇄', desc: '감속된 적의 물리 저항 −15%' },
  { name: '매의 눈', desc: '대공 석궁 사거리 +20% · 피해 +15%' },
  { name: '대지 겨냥', desc: '대공 석궁이 지상 적도 공격(피해 50%)' },
  { name: '고전압', desc: '테슬라 연쇄 대상 +1' },
  { name: '축전', desc: '테슬라 연쇄가 튈수록 약해지지 않음' },
  { name: '업화', desc: '화상 지속 +50% · 화상 중첩 +2' },
  { name: '초전도', desc: '감속된 적에게 번개 피해 +30%' },
  { name: '맹독', desc: '독 중첩 +4' },
  { name: '약점 공략', desc: '취약·파쇄 지속 +50%' },
  { name: '원소 융합', desc: '상태효과가 2가지 이상 걸린 적에게 피해 +20%' },
  { name: '현상금', desc: '처치 골드 +20%' },
  { name: '전리품', desc: '웨이브 클리어 보너스 +50%' },
  { name: '재활용', desc: '판매하면 비용을 전부 돌려받음' },
  { name: '할인 계약', desc: '모든 타워 비용 −20% · 목숨 −5' },
  { name: '광전사', desc: '모든 타워 피해 +25% · 사거리 −15%' },
  { name: '시간 압박', desc: '조기 호출 보너스 3배 · 웨이브 사이 시간 절반' },
  { name: '개척', desc: '잠긴 슬롯 1곳을 연다' },
];

/** 주간 규칙 (인덱스 = RULE_ID, 0은 비움 — 엔진 data/rules.ts·§C8) — 아이콘 1개 = 규칙 1개(§F0-4). 금지 타워(R6)는 bannedRuleText */
export const RULE_TEXT: readonly { icon: string; name: string; desc: string }[] = [
  { icon: '', name: '', desc: '' },
  { icon: '🌪', name: '질풍', desc: '적 이동 속도 +20%' },
  { icon: '🛡', name: '강철 군단', desc: '적 체력 +30% · 수 −20%' },
  { icon: '🦇', name: '하늘 습격', desc: '공중 적이 2배로 온다' },
  { icon: '👑', name: '엘리트 호위', desc: '보스가 엘리트를 데리고 온다' },
  { icon: '🧬', name: '증식', desc: '쓰러진 적 10%가 졸개 하나로 갈라진다' },
  { icon: '🚫', name: '금지', desc: '타워 1종을 지을 수 없다' },
  { icon: '⛔', name: '한계', desc: '타워는 Lv4까지만' },
  { icon: '🔒', name: '판매 금지', desc: '지은 타워를 팔 수 없다' },
  { icon: '🧱', name: '좁은 땅', desc: '슬롯 2곳이 막힌다' },
  { icon: '💰', name: '부자 출발', desc: '시작 골드 2배 · 처치 골드 절반' },
  { icon: '⏩', name: '서두름', desc: '조기 호출 보너스 2배' },
  { icon: '🎁', name: '보상 없음', desc: '클리어 보너스 없음 · 처치 골드 +30%' },
  { icon: '🥚', name: '유리 성벽', desc: '목숨 5로 시작' },
  { icon: '⏱', name: '쉼 없음', desc: '웨이브 사이 시간 절반' },
  { icon: '🃏', name: '카드 풍년', desc: '증강을 4웨이브마다 고른다' },
];

/** 금지 규칙(R6) 설명 — 이번 주 금지 타워 이름을 넣는다 */
export function bannedRuleText(bannedTower: number): string {
  const name = TOWER_NAMES[bannedTower];
  return name ? `${name}${objectParticle(name)} 지을 수 없다` : RULE_TEXT[6].desc;
}

/** 목적격 조사 — 마지막 글자에 받침이 있으면 '을', 없으면 '를'(한글이 아니면 '를') */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 !== 0 ? '을' : '를';
}
