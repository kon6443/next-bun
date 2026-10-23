/**
 * 브리핑 카드 (§F5) — 새 요소가 처음 나오는 스테이지를 시작할 때 1장. 다시 보기는 도감
 * S1은 손가락 가이드 튜토리얼(3단계)로 대신한다. 엔진을 import하지 않는다(도감 화면 번들)
 */

export type Briefing = { stageId: string; title: string; lines: readonly string[]; towers: readonly number[]; enemies: readonly number[] };

export const BRIEFINGS: readonly Briefing[] = [
  { stageId: 's2', title: '새 타워: 마법탑 · 새 적: 방패병', lines: ['방패병은 물리 피해에 강해요 — 마법탑으로', 'Lv3 타워는 분기 둘 중 하나로 키울 수 있어요(되돌릴 수 없음)'], towers: [2], enemies: [2] },
  { stageId: 's3', title: '새 타워: 서리탑 · 새 적: 분열체', lines: ['서리탑이 적을 느리게 해 다른 타워가 더 오래 때려요', '분열체는 쓰러지면 셋으로 갈라져요 — 범위 공격이 좋아요'], towers: [3], enemies: [3] },
  { stageId: 's4', title: '공중 적: 박쥐 떼!', lines: ['대포는 공중을 못 때려요', '대공 석궁·궁수탑으로 박쥐 떼를 막아요'], towers: [4], enemies: [4] },
  { stageId: 's5', title: 'Lv5 궁극 · 중간 보스: 소환사', lines: ['분기한 타워를 한 번 더 올리면 궁극 기술이 열려요', '소환사는 졸개를 불러내요 — 화력을 모아 빨리 쓰러뜨려요'], towers: [], enemies: [5] },
  { stageId: 's6', title: '새 타워: 테슬라 · 새 적: 유령·와이번', lines: ['테슬라 번개는 여러 적에게 튀어요', '유령은 물리 피해를 거의 막아요 · 와이번은 빠른 공중 적'], towers: [5], enemies: [6, 7] },
  { stageId: 's7', title: '새 적: 사제 · 공성 거인', lines: ['사제는 주변 적을 치유해요 — 표적을 「최강」·「선두」로 바꿔 먼저 노려요', '공성 거인은 아주 단단한 엘리트예요'], towers: [], enemies: [8, 9] },
  { stageId: 's8', title: '최종 보스: 용', lines: ['용은 공중 보스예요 — 대공 화력을 준비해요', '반쯤 다치면 저항이 바뀌고 박쥐 떼를 불러요'], towers: [], enemies: [10] },
];

export function briefingFor(stageId: string): Briefing | null {
  return BRIEFINGS.find((b) => b.stageId === stageId) ?? null;
}
