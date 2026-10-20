/**
 * unknown 에러 객체에서 메시지를 추출
 * ApiError·NetworkError는 Error를 상속하므로 instanceof Error로 함께 처리됨.
 * fetch 실패는 FetchService가 NetworkError(메시지 = 한국어 네트워크 안내)로 바꿔 던지므로 여기서 따로 바꾸지 않는다 —
 * 응답을 받은 뒤의 런타임 TypeError까지 "네트워크" 안내로 오인하지 않게
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  return fallback;
}
