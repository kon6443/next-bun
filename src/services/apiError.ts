import { ApiError, createApiError, type ApiErrorResponse } from '@/types/api';

/**
 * 실패 응답 → ApiError 공용 처리 — 서비스 파일마다 따로 두던 handleApiError 6벌을 하나로 모았다.
 * 규칙: 백엔드 본문에 code가 있으면 그 code·message로, 없으면 상태 코드 표의 code와
 * (서버 message → 상태별 문구 → 기본 문구) 순서의 메시지로 던진다.
 * 서비스마다 다른 점(상태 코드 표, JSON 아닌 본문, 기본 문구의 상태 접미)은 ApiErrorRules로 넘긴다 — 화면 문구·code를 바꾸지 않으려고 차이를 그대로 옮겼다
 */

/** 상태 코드 → 기본 에러 코드(백엔드 code가 없을 때) */
export const HTTP_ERROR_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  410: 'GONE',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
} as const;

type KnownStatus = keyof typeof HTTP_ERROR_CODES;

const BASE_STATUSES: readonly KnownStatus[] = [400, 401, 403, 404, 500];

/** 기본 5종(400·401·403·404·500)에 더할 상태만 골라 상태 코드 표를 만든다 — 표에 없는 상태는 UNKNOWN_ERROR */
export function statusCodeMap(...extra: KnownStatus[]): Readonly<Record<number, string>> {
  const map: Record<number, string> = {};
  for (const status of [...BASE_STATUSES, ...extra]) map[status] = HTTP_ERROR_CODES[status];
  return map;
}

/** 상태별 한국어 문구 + 기본 문구 */
export type ErrorMessageMap = { [status: number]: string | undefined; default: string };

export type ApiErrorRules = {
  /** 백엔드 code가 없을 때 쓸 상태 코드 표(statusCodeMap) */
  statusCodes: Readonly<Record<number, string>>;
  /** JSON이 아닌 본문(프록시 HTML 등)을 UNKNOWN_ERROR의 메시지로 그대로 쓴다 — 끄면 무시하고 상태 기반으로 */
  textBodyAsMessage?: boolean;
  /** 상태별 문구가 없을 때 기본 문구 뒤에 ": 상태"를 붙인다 */
  statusInFallback?: boolean;
};

export async function throwApiError(response: Response, messages: ErrorMessageMap, rules: ApiErrorRules): Promise<never> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    // 본문 읽기 실패 — 상태 코드 기반으로 던진다
  }

  let errorData: ApiErrorResponse | null = null;
  if (text) {
    try {
      errorData = JSON.parse(text) as ApiErrorResponse;
    } catch {
      if (rules.textBodyAsMessage) throw new ApiError('UNKNOWN_ERROR', text, response.status);
    }
  }

  if (errorData?.code) {
    throw createApiError(errorData, response.status);
  }

  const fallback = rules.statusInFallback ? `${messages.default}: ${response.status}` : messages.default;
  throw new ApiError(
    rules.statusCodes[response.status] || 'UNKNOWN_ERROR',
    errorData?.message || messages[response.status] || fallback,
    response.status,
  );
}

/** AbortSignal.timeout이 없는 오래된 브라우저에서는 상한 없이 */
export function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined;
}
