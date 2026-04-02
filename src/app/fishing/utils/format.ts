/** 무게를 사람이 읽기 쉬운 형식으로 변환 (g → kg 자동 전환) */
export function formatWeight(weightInGrams: number): string {
  if (weightInGrams >= 1000) {
    return `${(weightInGrams / 1000).toFixed(1)}kg`;
  }
  return `${weightInGrams}g`;
}

/** 난이도 수치(0~1)를 한국어 레이블로 변환 */
export function getDifficultyLabel(difficulty: number): string {
  if (difficulty <= 0.15) return '매우 쉬움';
  if (difficulty <= 0.3) return '쉬움';
  if (difficulty <= 0.5) return '보통';
  if (difficulty <= 0.7) return '어려움';
  return '매우 어려움';
}
