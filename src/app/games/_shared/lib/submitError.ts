import { ApiError } from '@/types/api';
import { extractErrorMessage } from '@/app/utils/errorUtils';

/**
 * 기록 등록 실패 분류 — 게임 오버 화면·시작 화면 재시도가 같은 기준을 쓴다
 * - name: 이름만 바꿔 같은 세션으로 다시 낼 수 있다 (세션 유지)
 * - final: 다시 내도 소용없다 (세션 소모·만료·검증 실패·형식 위반·너무 큼) — 보관 기록을 지운다
 * - retry: 네트워크·429·5xx — 보관해 두고 다시 시도
 */
export type SubmitErrorKind = 'name' | 'final' | 'retry';

/** 이름 오류는 이 두 code로만 판정한다 — 그 밖의 422 VALIDATION_ERROR는 리플레이·세션 형식 위반 */
const NAME_ERROR_CODES = new Set(['GAME_PLAYER_NAME_INVALID', 'GAME_PLAYER_NAME_FORBIDDEN']);

export function classifySubmitError(err: unknown, isRetry: boolean): { kind: SubmitErrorKind; message: string } {
  if (!(err instanceof ApiError)) {
    return { kind: 'retry', message: extractErrorMessage(err, '기록을 등록하지 못했습니다.') };
  }
  const message = err.message || err.getDefaultMessage();
  if (NAME_ERROR_CODES.has(err.code)) return { kind: 'name', message };
  if (err.status === 409 || err.code === 'GAME_SESSION_INVALID') {
    // 앞선 시도의 응답만 잃었으면 이미 등록됐을 수 있다
    return {
      kind: 'final',
      message: isRetry ? '이미 등록됐거나 세션이 만료됐어요. 랭킹에서 확인해 주세요.' : message,
    };
  }
  // 413 너무 큼 · 415 형식 오류 · 422 검증 실패 — 같은 요청을 다시 내도 결과가 같다
  if (err.status === 413 || err.status === 415 || err.status === 422) return { kind: 'final', message };
  return { kind: 'retry', message };
}
