import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getMyTeams,
  updateTeam,
  getTeamUsers,
  deleteTelegramLink,
  getTeamTasks,
  getTaskDetail,
  updateMyTeamNickname,
} from './teamService';
import { ApiError } from '@/types/api';

// 서비스 → FetchService → fetch 경로 전체를 실제로 타고, 네트워크만 stub 한다
const fetchMock = vi.fn();

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('teamService 응답·에러 처리', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('성공: Bearer 토큰으로 호출하고 본문을 그대로 반환한다', async () => {
    const body = { code: 'SUCCESS', message: 'ok', data: [] };
    fetchMock.mockResolvedValue(json(body));
    await expect(getMyTeams('tok')).resolves.toEqual(body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/teams$/);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('실패 + 백엔드 code가 있으면 그 code·message로 ApiError', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TEAM_FORBIDDEN', message: '권한 없음', timestamp: 't' }, 403));
    const err = await updateTeam(1, { teamName: 'a', teamDescription: '' }, 'tok').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'TEAM_FORBIDDEN', message: '권한 없음', status: 403 });
  });

  it('실패 + code 없음 + 본문 message: 상태 기반 code와 본문 message', async () => {
    fetchMock.mockResolvedValue(json({ message: '이름이 너무 깁니다' }, 400));
    await expect(updateTeam(1, { teamName: 'a', teamDescription: '' }, 'tok')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: '이름이 너무 깁니다',
      status: 400,
    });
  });

  it('실패 + 빈 본문: 호출부가 준 상태별 폴백 메시지', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(updateTeam(1, { teamName: 'a', teamDescription: '' }, 'tok')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: '팀을 찾을 수 없습니다.',
      status: 404,
    });
  });

  it('실패 + 빈 본문 + 상태별 메시지 없음: "default: 상태코드"', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(getMyTeams('tok')).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: '팀 목록 조회 실패: 500',
      status: 500,
    });
  });

  it('getTeamUsers: status 쿼리를 붙이고 joinedAt을 Date로 바꾼다', async () => {
    fetchMock.mockResolvedValue(
      json({ code: 'SUCCESS', message: 'ok', data: [{ userId: 1, userName: 'a', role: 'MEMBER', joinedAt: '2026-10-20T01:00:00.000Z', userActStatus: 1 }] }),
    );
    const res = await getTeamUsers(7, 'tok', 0);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/teams\/7\/users\?status=0$/);
    expect(res.data[0].joinedAt).toBeInstanceOf(Date);
    expect(res.data[0].joinedAt?.toISOString()).toBe('2026-10-20T01:00:00.000Z');
  });

  it('getTeamUsers: joinedAt이 null·누락·잘못된 값이면 null (Invalid Date·1970년 금지)', async () => {
    const base = { userName: 'a', teamNickname: 'a', role: 'MEMBER', userActStatus: 1 };
    fetchMock.mockResolvedValue(
      json({
        code: 'SUCCESS',
        message: 'ok',
        data: [
          { ...base, userId: 1, joinedAt: null },
          { ...base, userId: 2 },
          { ...base, userId: 3, joinedAt: 'not-a-date' },
        ],
      }),
    );
    const res = await getTeamUsers(7, 'tok');
    expect(res.data.map((u) => u.joinedAt)).toEqual([null, null, null]);
  });

  it('태스크 목록·상세 응답에 tags가 없으면(태그 도입 전 백엔드) 빈 배열로 맞춘다', async () => {
    const task = { taskId: 1, teamId: 1, taskName: 'T' };
    const tagged = { ...task, taskId: 2, tags: [{ tagId: 5, tagName: '버그', tagColor: '#F87171' }] };
    fetchMock.mockResolvedValueOnce(json({ code: 'SUCCESS', message: 'ok', data: { team: {}, tasks: [task, tagged] } }));
    const list = await getTeamTasks(1, 'tok');
    expect(list.data.tasks.map(t => t.tags)).toEqual([[], tagged.tags]);

    fetchMock.mockResolvedValueOnce(json({ code: 'SUCCESS', message: 'ok', data: { ...task, comments: [] } }));
    const detail = await getTaskDetail(1, 1, 'tok');
    expect(detail.data.tags).toEqual([]);
  });

  it('deleteTelegramLink: 성공이면 본문을 읽지 않고 undefined, 실패면 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteTelegramLink(1, 'tok')).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(deleteTelegramLink(1, 'tok')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: '팀 멤버만 텔레그램 연동을 해제할 수 있습니다.',
    });
  });

  it('updateMyTeamNickname: PUT users/me/nickname 에 teamNickname만 싣는다', async () => {
    const body = { code: 'SUCCESS', message: '', data: { teamId: 7, userId: 1, teamNickname: '수달', userName: '수달' } };
    fetchMock.mockResolvedValue(json(body));
    await expect(updateMyTeamNickname(7, '수달', 'tok')).resolves.toEqual(body);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/teams\/7\/users\/me\/nickname$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ teamNickname: '수달' });
  });

  it('updateMyTeamNickname: 403·422는 백엔드 code 그대로', async () => {
    fetchMock.mockResolvedValue(json({ code: 'TEAM_FORBIDDEN', message: 'forbidden' }, 403));
    await expect(updateMyTeamNickname(7, '수달', 'tok')).rejects.toMatchObject({ code: 'TEAM_FORBIDDEN', status: 403 });
    fetchMock.mockResolvedValue(json({ code: 'VALIDATION_ERROR', message: 'bad' }, 422));
    await expect(updateMyTeamNickname(7, '', 'tok')).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 422 });
  });
});
