import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createFeedback, getMyFeedbacks, getFeedbackDetail } from './feedbackService';
import { ApiError, ERROR_CODE_MESSAGES } from '@/types/api';

// 서비스 → FetchService → fetch 경로 전체를 실제로 타고, 네트워크만 stub 한다
const fetchMock = vi.fn();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('feedbackService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('작성: DTO 필드만 싣고, 값이 없는 pagePath·buildSha는 뺀다', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201));
    await createFeedback({ category: 'BUG', title: 't', content: 'c', pagePath: undefined, buildSha: undefined }, 'tok');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/feedbacks$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ category: 'BUG', title: 't', content: 'c' });
  });

  it('작성: pagePath·buildSha가 있으면 싣는다', async () => {
    fetchMock.mockResolvedValue(json({ code: 'SUCCESS', message: 'ok', data: {} }, 201));
    await createFeedback(
      { category: 'FEATURE', title: 't', content: 'c', pagePath: '/teams', buildSha: 'ae05efd' },
      'tok',
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      category: 'FEATURE',
      title: 't',
      content: 'c',
      pagePath: '/teams',
      buildSha: 'ae05efd',
    });
  });

  it('작성 429: 백엔드 code(FEEDBACK_RATE_LIMITED)를 그대로 ApiError로', async () => {
    fetchMock.mockResolvedValue(json({ code: 'FEEDBACK_RATE_LIMITED', message: 'limit', timestamp: 't' }, 429));
    const err = await createFeedback({ category: 'BUG', title: 't', content: 'c' }, 'tok').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'FEEDBACK_RATE_LIMITED', status: 429 });
    expect(err.getDefaultMessage()).toBe(ERROR_CODE_MESSAGES.FEEDBACK_RATE_LIMITED);
  });

  it('작성 422 + code 없는 본문: VALIDATION_ERROR와 본문 message', async () => {
    fetchMock.mockResolvedValue(json({ message: '제목이 너무 깁니다' }, 422));
    await expect(createFeedback({ category: 'BUG', title: 't', content: 'c' }, 'tok')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: '제목이 너무 깁니다',
      status: 422,
    });
  });

  it('작성 429 + 빈 본문: TOO_MANY_REQUESTS와 폴백 메시지', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 429 }));
    await expect(createFeedback({ category: 'BUG', title: 't', content: 'c' }, 'tok')).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message: '요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.',
      status: 429,
    });
  });

  it('내 목록: beforeId·limit을 쿼리로 보낸다 (없으면 쿼리 없음)', async () => {
    const page = { code: 'SUCCESS', message: 'ok', data: { items: [], hasMore: false } };
    fetchMock.mockResolvedValue(json(page));
    await expect(getMyFeedbacks('tok')).resolves.toEqual(page);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/feedbacks\/me$/);

    fetchMock.mockResolvedValue(json(page));
    await getMyFeedbacks('tok', { beforeId: 42, limit: 20 });
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/feedbacks\/me\?beforeId=42&limit=20$/);
  });

  it('상세 404 + 빈 본문: NOT_FOUND와 폴백 메시지', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(getFeedbackDetail(7, 'tok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '피드백을 찾을 수 없습니다.',
      status: 404,
    });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/feedbacks\/7$/);
  });
});
