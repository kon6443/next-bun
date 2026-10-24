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

export type SubmitErrorResult = {
  kind: SubmitErrorKind;
  message: string;
  /** 배포 뒤 옛 화면으로 낸 기록 — 새로고침해야 다음 판부터 등록된다(새로고침 버튼을 보인다) */
  reload?: true;
};

/** details.reason·engineReason — 백엔드 에러 details는 코드마다 모양이 달라 문자열만 좁혀 읽는다 */
function detailString(details: unknown, key: 'reason' | 'engineReason'): string | null {
  if (typeof details !== 'object' || details === null) return null;
  const value = (details as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export function classifySubmitError(err: unknown, isRetry: boolean): SubmitErrorResult {
  if (!(err instanceof ApiError)) {
    return { kind: 'retry', message: extractErrorMessage(err, '기록을 등록하지 못했습니다.') };
  }
  const message = err.message || err.getDefaultMessage();
  const reason = detailString(err.details, 'reason');
  if (NAME_ERROR_CODES.has(err.code)) return { kind: 'name', message };
  // 엔진 버전이 다르다(배포 뒤 옛 화면) — 다시 내도 같다, 새로고침 안내 (games-polish P2)
  if (err.code === 'GAME_SESSION_INVALID' && reason === 'ENGINE_VERSION') {
    return { kind: 'final', message: '새 버전이 나왔어요. 새로고침한 뒤 다음 판부터 등록할 수 있어요.', reload: true };
  }
  // 같은 보드에 같은 리플레이가 이미 있다 — 앞선 시도가 응답만 잃고 등록됐을 때도 이 응답이다
  if (err.code === 'GAME_REPLAY_DUPLICATE') return { kind: 'final', message: '이미 등록된 기록이에요.' };
  if (err.status === 409 || err.code === 'GAME_SESSION_INVALID') {
    // 앞선 시도의 응답만 잃었으면 이미 등록됐을 수 있다
    return {
      kind: 'final',
      message: isRetry ? '이미 등록됐거나 세션이 만료됐어요. 랭킹에서 확인해 주세요.' : message,
    };
  }
  // 웨이브를 하나도 시작하지 않은 판(디펜스) — 엔진이 거절한 이유를 알려 준다
  if (err.code === 'GAME_REPLAY_INVALID' && reason === 'REPLAY_REJECTED' && detailString(err.details, 'engineReason') === 'NOT_STARTED') {
    return { kind: 'final', message: '웨이브를 시작한 판만 등록할 수 있어요.' };
  }
  // 413 너무 큼 · 415 형식 오류 · 422 검증 실패 — 같은 요청을 다시 내도 결과가 같다
  if (err.status === 413 || err.status === 415 || err.status === 422) return { kind: 'final', message };
  // 네트워크·429·5xx(검증 대기열 503 GAME_VERIFY_BUSY 포함 — 세션이 그대로라 같은 세션으로 다시 낸다)
  return { kind: 'retry', message };
}
