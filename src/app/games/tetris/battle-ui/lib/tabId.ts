/**
 * 이 탭의 식별자 (D-007) — 경기 중에는 같은 탭의 재연결만 자리를 넘겨받는다
 * 저장소에 두지 않고 모듈 메모리에만 둔다: 새로고침·탭 복제는 새 값이 되고, 대전 화면을 오가도(provider 재마운트) 그대로다
 * 처음 쓸 때 만든다 — 서버 렌더에서 값이 생기지 않게
 */

let tabId: string | null = null;

/** 보안 용도가 아니다(유효한 토큰·로그인과 함께일 때만 의미가 있다) — randomUUID가 없는 비보안 http에서는 난수로 대신한다 */
function createTabId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getTabId(): string {
  tabId ??= createTabId();
  return tabId;
}
