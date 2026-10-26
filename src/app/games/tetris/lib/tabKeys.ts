/**
 * 탭 목록 키보드 이동(WAI-ARIA tabs) — ←·→는 돌아가며, Home·End는 처음·끝. 다른 키면 null
 * 스킨 장착 모달·도감이 같은 규칙을 쓴다
 */
export function nextTabByKey<T>(tabs: readonly T[], current: T, key: string): T | null {
  const index = tabs.indexOf(current);
  if (key === "ArrowRight") return tabs[(index + 1) % tabs.length];
  if (key === "ArrowLeft") return tabs[(index - 1 + tabs.length) % tabs.length];
  if (key === "Home") return tabs[0];
  if (key === "End") return tabs[tabs.length - 1];
  return null;
}
