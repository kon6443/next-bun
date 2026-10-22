/**
 * 리플레이 공유 공통 — scoreId 검사·클립보드·Web Share (게임 무관)
 */

/** 경로의 scoreId — 양의 정수가 아니면 null (백엔드에 묻지 않는다) */
export function parseScoreId(raw: string): number | null {
  return /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}

/** 비보안 컨텍스트(http)·구형 브라우저에는 clipboard API가 없다 */
export async function copyText(text: string): Promise<'copied' | 'unsupported' | 'failed'> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return 'unsupported';
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** 사용자가 공유 시트를 닫으면(AbortError) 실패가 아니라 취소다 — 에러 토스트를 띄우지 않는다 */
export async function webShare(data: ShareData): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share(data);
    return 'shared';
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}
