import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/types/api';
import type { BattleReplayInput } from '../../battle-engine';
import { BattleReplayErrorCodes as C, SUBMIT_RETRIES, submitReplayWithRetry } from './replaySubmit';

const replay = { battleEngineVersion: 1, seed: 1, das: 10, arr: 2, frames: 10, inputs: [], garbage: [] } as BattleReplayInput;
const ok = (verdict: 'VERIFIED' | 'INVALID') => ({ code: 'SUCCESS' as const, message: 'ok', data: { verdict } });
const fail = (status: number, code = 'X') => new ApiError(code, 'x', status);
const noSleep = () => Promise.resolve();

const run = (submit: ReturnType<typeof vi.fn>) => submitReplayWithRetry(submit as never, 'm1', 'tok', replay, undefined, noSleep);

describe('리플레이 제출 결과 (DESIGN §17-1)', () => {
  it('201 VERIFIED → 저장됨, INVALID → 검증 실패(다시 보내지 않음)', async () => {
    expect(await run(vi.fn().mockResolvedValue(ok('VERIFIED')))).toBe('saved');
    const invalid = vi.fn().mockResolvedValue(ok('INVALID'));
    expect(await run(invalid)).toBe('invalid');
    expect(invalid).toHaveBeenCalledTimes(1);
  });

  it('본문은 playerToken·replay만, 매치 id로 보낸다', async () => {
    const submit = vi.fn().mockResolvedValue(ok('VERIFIED'));
    await submitReplayWithRetry(submit as never, 'm1', 'tok', replay, 'access', noSleep);
    expect(submit).toHaveBeenCalledWith('m1', { playerToken: 'tok', replay }, 'access');
  });

  it('이미 제출 → 저장됨, 경기 미종료 → 다시 보낸다 (둘 다 409 — code로 구분)', async () => {
    expect(await run(vi.fn().mockRejectedValue(fail(409, C.REPLAY_ALREADY_SUBMITTED)))).toBe('saved');
    const notEnded = vi.fn().mockRejectedValueOnce(fail(409, C.MATCH_NOT_ENDED)).mockResolvedValue(ok('VERIFIED'));
    expect(await run(notEnded)).toBe('saved');
    expect(notEnded).toHaveBeenCalledTimes(2);
  });

  it('마감 → 마감, 기록 없음·토큰 불일치·형식·크기 초과 → 실패 (다시 보내지 않음)', async () => {
    expect(await run(vi.fn().mockRejectedValue(fail(410, C.SUBMISSION_CLOSED)))).toBe('expired');
    for (const [status, code] of [
      [404, C.MATCH_NOT_FOUND],
      [403, C.PLAYER_TOKEN_INVALID],
      [422, 'VALIDATION_ERROR'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [409, 'CONFLICT_SOMETHING_ELSE'],
    ] as const) {
      const submit = vi.fn().mockRejectedValue(fail(status, code));
      expect(await run(submit)).toBe('failed');
      expect(submit).toHaveBeenCalledTimes(1);
    }
  });

  it('스로틀·Redis 장애·서버 오류·네트워크 오류는 짧게 다시 보내고, 소진되면 실패', async () => {
    const recovers = vi.fn().mockRejectedValueOnce(fail(429, 'TOO_MANY_REQUESTS')).mockResolvedValue(ok('VERIFIED'));
    expect(await run(recovers)).toBe('saved');
    const down = vi.fn().mockRejectedValue(fail(503, C.UNAVAILABLE));
    expect(await run(down)).toBe('failed');
    expect(down).toHaveBeenCalledTimes(1 + SUBMIT_RETRIES);
    const serverError = vi.fn().mockRejectedValueOnce(fail(500, 'INTERNAL_SERVER_ERROR')).mockResolvedValue(ok('VERIFIED'));
    expect(await run(serverError)).toBe('saved');
    const network = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(ok('INVALID'));
    expect(await run(network)).toBe('invalid');
  });
});
