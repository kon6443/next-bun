import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError } from '@/types/api';
import { getTaskDetail } from './teamService';
import { getGameScore } from './gameService';
import { getFortressMatch } from './fortressService';
import { getBattleMatch } from './tetrisBattleService';
import { getFeedbackDetail } from './feedbackService';
import { getMySkins } from './userService';

/**
 * 서비스별 실패 응답 → ApiError(code·message) 고정 — 공용 handleApiError(apiError.ts)로 모으기 전 동작 그대로.
 * 서비스마다 상태 코드 → code 표와 폴백 규칙이 다르다(아래 표). 표를 바꾸면 화면 문구·code 분기가 바뀐다
 */
const fetchMock = vi.fn();

const BASE_CODES: Record<number, string> = { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 500: 'INTERNAL_SERVER_ERROR' };
const TOO_MANY = '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.';
const STATUSES = [400, 401, 403, 404, 409, 410, 413, 422, 429, 500, 503, 418];

type Case = {
  name: string;
  call: () => Promise<unknown>;
  codes: Record<number, string>;
  messages: Record<number, string>;
  fallback: string;
  /** teamService만: 상태 문구가 없으면 "기본 문구: 상태" */
  statusSuffix?: boolean;
  /** teamService만: JSON이 아닌 본문은 UNKNOWN_ERROR + 본문 그대로 */
  textBodyAsMessage?: boolean;
};

const CASES: Case[] = [
  {
    name: 'teamService',
    call: () => getTaskDetail(1, 2, 'tok'),
    codes: BASE_CODES,
    messages: { 403: '팀 멤버만 접근할 수 있습니다.', 404: '태스크를 찾을 수 없습니다.', 400: '태스크가 해당 팀에 속하지 않습니다.' },
    fallback: '태스크 상세 조회 실패',
    statusSuffix: true,
    textBodyAsMessage: true,
  },
  {
    name: 'gameService',
    call: () => getGameScore('tetris', 1),
    codes: { ...BASE_CODES, 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 422: 'VALIDATION_ERROR', 429: 'TOO_MANY_REQUESTS', 503: 'SERVICE_UNAVAILABLE' },
    messages: { 404: '기록을 찾을 수 없습니다.', 429: TOO_MANY },
    fallback: '기록을 불러오지 못했습니다.',
  },
  {
    name: 'fortressService',
    call: () => getFortressMatch('m1'),
    // 413이 code 표에 없다(문구 표에는 있다) — 지금 동작 그대로 고정
    codes: { ...BASE_CODES, 409: 'CONFLICT', 422: 'VALIDATION_ERROR', 429: 'TOO_MANY_REQUESTS', 503: 'SERVICE_UNAVAILABLE' },
    messages: { 404: '공개되지 않은 경기예요.', 429: TOO_MANY },
    fallback: '경기 기록을 불러오지 못했습니다.',
  },
  {
    name: 'tetrisBattleService',
    call: () => getBattleMatch('m1'),
    codes: { ...BASE_CODES, 409: 'CONFLICT', 410: 'GONE', 413: 'PAYLOAD_TOO_LARGE', 422: 'VALIDATION_ERROR', 429: 'TOO_MANY_REQUESTS', 503: 'SERVICE_UNAVAILABLE' },
    messages: { 404: '공개되지 않은 경기예요.', 429: TOO_MANY },
    fallback: '경기 기록을 불러오지 못했습니다.',
  },
  {
    name: 'feedbackService',
    call: () => getFeedbackDetail(1, 'tok'),
    codes: { ...BASE_CODES, 422: 'VALIDATION_ERROR', 429: 'TOO_MANY_REQUESTS' },
    messages: { 404: '피드백을 찾을 수 없습니다.' },
    fallback: '피드백을 불러오지 못했습니다.',
  },
  {
    name: 'userService',
    call: () => getMySkins('tok'),
    codes: BASE_CODES,
    messages: {},
    fallback: '스킨 정보를 불러오지 못했습니다.',
  },
];

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('실패 응답인데 throw하지 않았다');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(CASES)('$name 실패 응답 → ApiError', (c) => {
  it.each(STATUSES)('본문 없는 %i: 상태 코드 표의 code, 상태 문구 → 폴백', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    const err = await caught(c.call());
    expect(err.code).toBe(c.codes[status] ?? 'UNKNOWN_ERROR');
    const fallback = c.statusSuffix ? `${c.fallback}: ${status}` : c.fallback;
    expect(err.message).toBe(c.messages[status] ?? fallback);
    expect(err.status).toBe(status);
  });

  it('code 없는 JSON 본문: 서버 message가 상태 문구보다 먼저', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '서버가 보낸 문구' }), { status: 404 }));
    const err = await caught(c.call());
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('서버가 보낸 문구');
  });

  it('code 있는 JSON 본문: 백엔드 code·message 그대로', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'TEAM_NOT_FOUND', message: '백엔드 문구', statusCode: 404, timestamp: 't' }), { status: 404 }),
    );
    const err = await caught(c.call());
    expect(err.code).toBe('TEAM_NOT_FOUND');
    expect(err.message).toBe('백엔드 문구');
    expect(err.status).toBe(404);
  });

  it('JSON이 아닌 본문(프록시 HTML 등)', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const err = await caught(c.call());
    if (c.textBodyAsMessage) {
      expect(err.code).toBe('UNKNOWN_ERROR');
      expect(err.message).toBe('<html>Bad Gateway</html>');
    } else {
      expect(err.code).toBe('UNKNOWN_ERROR');
      expect(err.message).toBe(c.fallback);
    }
    expect(err.status).toBe(502);
  });
});
