import { ApiError } from '@/types/api';
import { sleep } from '@/app/games/_shared/lib/sleep';
import type { BattleReplayInput } from '../../battle-engine';
import type { submitBattleReplay } from '@/services/tetrisBattleService';

/**
 * 경기 후 리플레이 제출 결과 (DESIGN §17-1) — 결과 화면에 조용히 표시한다
 * - saved: 검증 통과(VERIFIED) 또는 이미 제출(TETRIS_BATTLE_REPLAY_ALREADY_SUBMITTED)
 * - invalid: 검증 실패(INVALID) — 다시 보내도 같다
 * - expired: 마감(TETRIS_BATTLE_SUBMISSION_CLOSED, 종료 후 60초)
 * - failed: 기록 없음·토큰 불일치·형식(VALIDATION_ERROR)·크기 초과 등 다시 보내도 안 되는 실패, 또는 재시도 소진
 */
export type ReplaySubmitStatus = 'submitting' | 'saved' | 'invalid' | 'expired' | 'failed';

/** 백엔드 에러 코드 — 정본 bun `src/modules/tetris-battle/tetris-battle-error.dto.ts` */
export const BattleReplayErrorCodes = {
  MATCH_NOT_FOUND: 'TETRIS_BATTLE_MATCH_NOT_FOUND',
  PLAYER_TOKEN_INVALID: 'TETRIS_BATTLE_PLAYER_TOKEN_INVALID',
  REPLAY_ALREADY_SUBMITTED: 'TETRIS_BATTLE_REPLAY_ALREADY_SUBMITTED',
  /** 서버상 경기가 아직 끝나지 않음 — 잠시 뒤 다시 */
  MATCH_NOT_ENDED: 'TETRIS_BATTLE_MATCH_NOT_ENDED',
  SUBMISSION_CLOSED: 'TETRIS_BATTLE_SUBMISSION_CLOSED',
  /** Redis 장애 — 잠시 뒤 다시 */
  UNAVAILABLE: 'TETRIS_BATTLE_UNAVAILABLE',
} as const;

/** 다시 보내면 나아질 수 있는 code — 경기 미종료·서버 일시 장애·스로틀(전역 TOO_MANY_REQUESTS) */
const RETRYABLE_CODES = new Set<string>([BattleReplayErrorCodes.MATCH_NOT_ENDED, BattleReplayErrorCodes.UNAVAILABLE, 'TOO_MANY_REQUESTS']);

/** 다시 보내는 횟수와 간격 */
export const SUBMIT_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

type SubmitFn = typeof submitBattleReplay;

/**
 * 다시 보내면 나아질 수 있는 실패 — 네트워크 오류(ApiError 아님) 포함
 * 서버 일반 오류(5xx)는 코드가 정해져 있지 않아 상태로 본다
 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return RETRYABLE_CODES.has(err.code) || err.status >= 500;
}

/**
 * 한 경기의 리플레이를 제출한다 — 화면을 막지 않게 호출 쪽이 기다리지 않아도 된다
 * 응답은 백엔드 code로 나눈다(.claude/rules/services.md)
 */
export async function submitReplayWithRetry(
  submit: SubmitFn,
  matchId: string,
  playerToken: string,
  replay: BattleReplayInput,
  accessToken?: string,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<Exclude<ReplaySubmitStatus, 'submitting'>> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await submit(matchId, { playerToken, replay }, accessToken);
      return response.data.verdict === 'VERIFIED' ? 'saved' : 'invalid';
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === BattleReplayErrorCodes.REPLAY_ALREADY_SUBMITTED) return 'saved';
        if (err.code === BattleReplayErrorCodes.SUBMISSION_CLOSED) return 'expired';
      }
      if (!isRetryable(err) || attempt >= SUBMIT_RETRIES) return 'failed';
      await wait(RETRY_DELAY_MS * (attempt + 1));
    }
  }
}
