/**
 * unknown 에러 객체에서 메시지를 추출
 * ApiError는 Error를 상속하므로 instanceof Error로 함께 처리됨
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}
