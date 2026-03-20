/** 무게를 사람이 읽기 쉬운 형식으로 변환 (g → kg 자동 전환) */
export function formatWeight(weightInGrams: number): string {
  if (weightInGrams >= 1000) {
    return `${(weightInGrams / 1000).toFixed(1)}kg`;
  }
  return `${weightInGrams}g`;
}
