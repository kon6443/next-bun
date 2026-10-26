import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMySkins = vi.fn();
const updateMySkins = vi.fn();
vi.mock('@/services/userService', () => ({
  getMySkins: (...args: unknown[]) => getMySkins(...args),
  updateMySkins: (...args: unknown[]) => updateMySkins(...args),
}));

import { ApiError } from '@/types/api';
import { __resetMySkinsForTests, equipMySkin, getMySkinsState, loadMySkins, resetMySkins } from './mySkins';

const catalog = { block: [{ id: 'default', owned: true, unlock: 'default' }], effect: [], board: [], background: [] };
const ok = (equipped: Record<string, string>) => ({ code: 'SUCCESS', data: { equipped, catalog }, message: '' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  __resetMySkinsForTests();
  getMySkins.mockReset();
  updateMySkins.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('내 스킨 장착 저장소', () => {
  it('처음은 게스트 — 모든 슬롯 기본', () => {
    expect(getMySkinsState()).toMatchObject({ status: 'guest', equipped: { block: 'default', effect: 'default', board: 'default', background: 'default' } });
  });

  it('불러오기 — 서버 장착을 반영하고, 빠진 슬롯은 기본. 같은 토큰은 한 번만 부른다', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'neon', effect: 'gameboy', board: 'high-contrast' }));
    await loadMySkins('t1');
    await loadMySkins('t1');
    expect(getMySkins).toHaveBeenCalledTimes(1);
    expect(getMySkinsState()).toMatchObject({
      status: 'ready',
      equipped: { block: 'neon', effect: 'gameboy', board: 'high-contrast', background: 'default' },
      catalog: { block: [{ id: 'default' }] },
    });
  });

  it('불러오기 실패 — 기본으로 그리고(error), 다음 진입 때 다시 부른다', async () => {
    getMySkins.mockRejectedValueOnce(new Error('down'));
    await loadMySkins('t1');
    expect(getMySkinsState()).toMatchObject({ status: 'error', equipped: { block: 'default' } });
    getMySkins.mockResolvedValueOnce(ok({ block: 'neon', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    expect(getMySkinsState().equipped.block).toBe('neon');
  });

  it('장착 — 응답 전에 먼저 반영(낙관적), 성공하면 서버 값으로', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'default', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    const put = deferred<unknown>();
    updateMySkins.mockReturnValue(put.promise);
    const pending = equipMySkin('board', 'neon', 't1');
    expect(getMySkinsState().equipped.board).toBe('neon');
    expect(updateMySkins).toHaveBeenCalledWith({ board: 'neon' }, 't1');
    put.resolve(ok({ block: 'default', effect: 'default', board: 'neon', background: 'default' }));
    await pending;
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { board: 'neon' } });
  });

  it('장착 실패 — 그 슬롯만 이전 값으로 되돌리고 에러를 다시 던진다', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'gameboy', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    updateMySkins.mockRejectedValue(Object.assign(new Error('없는 스킨'), { code: 'USER_SKIN_UNKNOWN' }));
    await expect(equipMySkin('block', 'neon', 't1')).rejects.toMatchObject({ code: 'USER_SKIN_UNKNOWN' });
    expect(getMySkinsState().equipped.block).toBe('gameboy');
  });

  it('빠른 연속 변경 — 늦게 온 첫 응답이 두 번째 선택을 덮지 않고, 첫 요청 실패도 두 번째 선택을 되돌리지 않는다', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'default', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const a = equipMySkin('block', 'neon', 't1');
    const b = equipMySkin('block', 'gameboy', 't1');
    second.resolve(ok({ block: 'gameboy', effect: 'default', board: 'default', background: 'default' }));
    await b;
    first.reject(new Error('late fail'));
    await expect(a).rejects.toThrow('late fail');
    expect(getMySkinsState().equipped.block).toBe('gameboy');
  });

  it('로그아웃 — 게스트(기본)로 돌아가고 진행 중 응답은 무시한다', async () => {
    const get = deferred<unknown>();
    getMySkins.mockReturnValue(get.promise);
    const pending = loadMySkins('t1');
    resetMySkins();
    get.resolve(ok({ block: 'neon', effect: 'neon', board: 'neon', background: 'neon' }));
    await pending;
    expect(getMySkinsState()).toMatchObject({ status: 'guest', equipped: { block: 'default' } });
  });

  it('불러오기 만료(401) — 기본으로 그리고(expired), 같은 토큰으로는 다시 부르지 않는다 · 다시 로그인(새 토큰)하면 불러온다', async () => {
    getMySkins.mockRejectedValueOnce(new ApiError('AUTH_UNAUTHORIZED', '만료', 401));
    await loadMySkins('old');
    expect(getMySkinsState()).toMatchObject({ status: 'expired', equipped: { block: 'default' } });
    await loadMySkins('old');
    expect(getMySkins).toHaveBeenCalledTimes(1);
    getMySkins.mockResolvedValueOnce(ok({ block: 'neon', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('new');
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { block: 'neon' } });
  });

  it('다른 토큰(계정 전환)으로 불러오는 동안 이전 계정의 장착을 그리지 않는다', async () => {
    getMySkins.mockResolvedValueOnce(ok({ block: 'neon', effect: 'neon', board: 'neon', background: 'neon' }));
    await loadMySkins('a');
    getMySkins.mockReturnValueOnce(new Promise(() => {}));
    void loadMySkins('b');
    expect(getMySkinsState()).toMatchObject({ status: 'loading', equipped: { block: 'default', background: 'default' } });
  });

  it('장착 중 로그아웃 뒤 PUT이 실패해도 게스트 상태를 덮지 않는다 — 게스트는 늘 기본', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'neon', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    const put = deferred<unknown>();
    updateMySkins.mockReturnValue(put.promise);
    const pending = equipMySkin('block', 'default', 't1');
    resetMySkins();
    put.reject(new Error('net'));
    await expect(pending).rejects.toThrow('net');
    expect(getMySkinsState()).toMatchObject({ status: 'guest', equipped: { block: 'default' } });
  });

  it('다른 슬롯을 연달아 바꾸고 응답 순서가 바뀌어도 두 선택이 모두 남는다 — 응답은 그 슬롯에만 반영', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'default', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const blockReq = equipMySkin('block', 'neon', 't1');
    const effectReq = equipMySkin('effect', 'neon', 't1');
    // 서버가 effect를 먼저 처리 — 그 응답의 block은 아직 이전 값
    b.resolve(ok({ block: 'default', effect: 'neon', board: 'default', background: 'default' }));
    await effectReq;
    expect(getMySkinsState().equipped).toMatchObject({ block: 'neon', effect: 'neon' });
    a.resolve(ok({ block: 'neon', effect: 'neon', board: 'default', background: 'default' }));
    await blockReq;
    expect(getMySkinsState().equipped).toMatchObject({ block: 'neon', effect: 'neon' });
  });

  it('장착이 만료(401)로 실패하면 되돌리고 expired로 — 다시 로그인하라고 안내하게', async () => {
    getMySkins.mockResolvedValue(ok({ block: 'default', effect: 'default', board: 'default', background: 'default' }));
    await loadMySkins('t1');
    updateMySkins.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', '만료', 401));
    await expect(equipMySkin('board', 'neon', 't1')).rejects.toMatchObject({ status: 401 });
    expect(getMySkinsState()).toMatchObject({ status: 'expired', equipped: { board: 'default' } });
  });
});
