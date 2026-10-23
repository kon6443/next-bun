/**
 * 새로고침 직후의 첫 입장인가 — 문서당 한 번만 true (그 뒤 "이 탭에서 계속하기"·앱 안 이동으로 다시 온 방·복귀 실패 뒤 자동 입장은 false)
 * 새로고침 직후에는 이전 연결이 서버에서 아직 안 끊겨 SEAT_IN_USE가 올 수 있어 잠시 기다려 다시 묻는다
 * 그 밖에는 다른 탭·기기가 정말 경기 중이다 — 다시 묻다가 그쪽이 잠깐 끊긴 틈에 자리를 가져가 진행 중인 판을 기권시키지 않게
 * (Navigation Timing 항목은 문서를 불러올 때 한 번 정해지고 앱 안 이동에는 바뀌지 않는다 — 그래서 소비형으로)
 */
let consumed = false;

export function consumeReloadEntry(): boolean {
  if (consumed) return false;
  consumed = true;
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav?.type === 'reload' && new URL(nav.name).pathname === window.location.pathname;
  } catch {
    return false;
  }
}

/** 테스트 전용 */
export function resetReloadEntryForTest(): void {
  consumed = false;
}
