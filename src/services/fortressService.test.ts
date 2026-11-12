// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  equipFortressSkin,
  getFortressMatch,
  getFortressMatchList,
  getFortressMatchPoints,
  getFortressReplay,
  getMyFortressSkins,
  isFortressMatchId,
  upgradeFortressSkin,
} from './fortressService';
import { ApiError } from '@/types/api';

// 서비스 → FetchService → fetch 경로 전체를 실제로 타고, 네트워크만 stub 한다
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ok = (data: unknown) => json({ code: 'SUCCESS', message: '', data });

describe('fortressService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('경기 결과·리플레이: 인증 없이 GET /fortress/matches/:id(/replay), 404는 코드 그대로 ApiError', async () => {
    fetchMock.mockResolvedValueOnce(ok({ matchId: 'm1', players: [] }));
    expect((await getFortressMatch('m 1')).data.matchId).toBe('m1');
    const [matchUrl, init] = fetchMock.mock.calls[0];
    expect(matchUrl).toMatch(/\/api\/v1\/fortress\/matches\/m%201$/);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBeUndefined();

    fetchMock.mockResolvedValueOnce(ok({ matchId: 'm1', actions: [], slots: [], stateHash: 'h' }));
    await getFortressReplay('m1');
    const [replayUrl] = fetchMock.mock.calls[1];
    expect(replayUrl).toMatch(/\/api\/v1\/fortress\/matches\/m1\/replay$/);

    fetchMock.mockResolvedValueOnce(json({ code: 'FORTRESS_REPLAY_NOT_FOUND', message: 'x', timestamp: 't' }, 404));
    const error = await getFortressReplay('m1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'FORTRESS_REPLAY_NOT_FOUND', status: 404 });
  });

  it('최근 경기: limit·cursor를 query로(커서는 받은 그대로), 없으면 query 없이', async () => {
    fetchMock.mockImplementation(async () => ok({ items: [], nextCursor: null }));
    await getFortressMatchList({ limit: 10, cursor: 'a+b/=' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/fortress\/matches\?limit=10&cursor=a%2Bb%2F%3D$/);
    await getFortressMatchList();
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/fortress\/matches$/);
  });

  it('포인트: Bearer 토큰으로 GET …/points, 401은 AUTH_UNAUTHORIZED ApiError(전역 로그아웃 없이)', async () => {
    fetchMock.mockResolvedValueOnce(ok({ matchId: 'm1', participant: true, earned: 50000, memo: '참가 20,000 · 승리 30,000' }));
    expect((await getFortressMatchPoints('m1', 'tok')).data.earned).toBe(50000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/v1\/fortress\/matches\/m1\/points$/);
    expect(init.headers.Authorization).toBe('Bearer tok');

    const onUnauthorized = vi.fn();
    window.addEventListener('backend:unauthorized', onUnauthorized);
    fetchMock.mockResolvedValueOnce(json({ code: 'AUTH_UNAUTHORIZED', message: 'x', timestamp: 't' }, 401));
    const error = await getFortressMatchPoints('m1', 'tok').catch((e: unknown) => e);
    window.removeEventListener('backend:unauthorized', onUnauthorized);
    expect(error).toMatchObject({ code: 'AUTH_UNAUTHORIZED', status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('스킨: GET·PUT /fortress/skins/me(본문 skinId만), POST …/upgrade(본문 skinId·level만), 409 코드 그대로', async () => {
    const skins = { equipped: { id: 'default', level: 1 }, points: { earned: 0, spent: 0, balance: 0 }, maxLevel: 5, levelCosts: [], items: [] };
    fetchMock.mockImplementation(async () => ok(skins));
    await getMyFortressSkins('tok');
    await equipFortressSkin('neon', 'tok');
    await upgradeFortressSkin({ skinId: 'neon', level: 2 }, 'tok');
    const [getUrl, getInit] = fetchMock.mock.calls[0];
    expect(getUrl).toMatch(/\/api\/v1\/fortress\/skins\/me$/);
    expect(getInit.method).toBe('GET');
    const [, putInit] = fetchMock.mock.calls[1];
    expect(putInit.method).toBe('PUT');
    expect(JSON.parse(putInit.body)).toEqual({ skinId: 'neon' });
    const [postUrl, postInit] = fetchMock.mock.calls[2];
    expect(postUrl).toMatch(/\/api\/v1\/fortress\/skins\/me\/upgrade$/);
    expect(JSON.parse(postInit.body)).toEqual({ skinId: 'neon', level: 2 });
    expect(postInit.headers.Authorization).toBe('Bearer tok');

    fetchMock.mockResolvedValueOnce(json({ code: 'USER_POINTS_INSUFFICIENT', message: '부족', timestamp: 't' }, 409));
    const error = await upgradeFortressSkin({ skinId: 'neon', level: 2 }, 'tok').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'USER_POINTS_INSUFFICIENT', status: 409 });
  });

  it('경기 id 형식 — 16자 영숫자·_·-', () => {
    expect(isFortressMatchId('kYDnp6WGrJZAlFGf')).toBe(true);
    expect(isFortressMatchId('short')).toBe(false);
    expect(isFortressMatchId('kYDnp6WGrJZAlFG!')).toBe(false);
  });
});
