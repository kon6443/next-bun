import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMySkins = vi.fn();
const updateMySkins = vi.fn();
vi.mock('@/services/userService', () => ({
  getMySkins: (...args: unknown[]) => getMySkins(...args),
  updateMySkins: (...args: unknown[]) => updateMySkins(...args),
}));

import { ApiError } from '@/types/api';
import { __resetMySkinsForTests, equipMySkin, getMySkinsState, loadMySkins, resetMySkins, retryMySkins } from './mySkins';

const catalog = { block: [{ id: 'default', owned: true, unlock: 'default' }], effect: [], board: [], background: [] };
const base = { block: 'default', effect: 'default', board: 'default', background: 'default' };
const ok = (equipped: Record<string, string>) => ({ code: 'SUCCESS', data: { equipped: { ...base, ...equipped }, catalog }, message: '' });
const expired = () => new ApiError('AUTH_UNAUTHORIZED', '만료', 401);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
/** 마이크로태스크를 비운다 — 앞 요청이 끝난 뒤 기다리던 선택을 보내는 것까지 */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetMySkinsForTests();
  getMySkins.mockReset();
  updateMySkins.mockReset();
});

async function loaded(equipped: Record<string, string> = {}, token = 't1') {
  getMySkins.mockResolvedValueOnce(ok(equipped));
  await loadMySkins(token);
}

describe('내 스킨 — 불러오기', () => {
  it('처음은 게스트 — 모든 슬롯 기본', () => {
    expect(getMySkinsState()).toMatchObject({ status: 'guest', equipped: base });
  });

  it('서버 장착을 반영하고 빠진 슬롯은 기본, 같은 토큰은 한 번만 부른다', async () => {
    getMySkins.mockResolvedValue({ code: 'SUCCESS', data: { equipped: { block: 'neon', effect: 'gameboy', board: 'high-contrast' }, catalog }, message: '' });
    await loadMySkins('t1');
    await loadMySkins('t1');
    expect(getMySkins).toHaveBeenCalledTimes(1);
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { block: 'neon', effect: 'gameboy', board: 'high-contrast', background: 'default' } });
  });

  it('일시 실패 — 기본으로 그리고(error), retry는 같은 토큰이어도 다시 부른다', async () => {
    getMySkins.mockRejectedValueOnce(new Error('down'));
    await loadMySkins('t1');
    expect(getMySkinsState()).toMatchObject({ status: 'error', equipped: { block: 'default' } });
    getMySkins.mockResolvedValueOnce(ok({ block: 'neon' }));
    await retryMySkins('t1');
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { block: 'neon' } });
  });

  it('만료(401) — 기본으로 그리고(expired), 같은 토큰은 다시 부르지 않는다 · 새 토큰이면 부른다', async () => {
    getMySkins.mockRejectedValueOnce(expired());
    await loadMySkins('old');
    await loadMySkins('old');
    expect(getMySkins).toHaveBeenCalledTimes(1);
    expect(getMySkinsState()).toMatchObject({ status: 'expired', equipped: { block: 'default' } });
    await loaded({ block: 'neon' }, 'new');
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { block: 'neon' } });
  });

  it('다른 토큰(계정 전환)으로 불러오는 동안 이전 계정의 장착을 그리지 않는다', async () => {
    await loaded({ block: 'neon', background: 'neon' }, 'a');
    getMySkins.mockReturnValueOnce(new Promise(() => {}));
    void loadMySkins('b');
    expect(getMySkinsState()).toMatchObject({ status: 'loading', equipped: base });
  });

  it('불러오는 중 로그아웃하면 늦은 응답·실패를 반영하지 않는다', async () => {
    const get = deferred<unknown>();
    getMySkins.mockReturnValueOnce(get.promise);
    const pending = loadMySkins('t1');
    resetMySkins();
    get.reject(new Error('down'));
    await pending;
    expect(getMySkinsState()).toMatchObject({ status: 'guest', equipped: base });
  });
});

describe('내 스킨 — 장착', () => {
  it('응답 전에 먼저 반영(낙관적), 바꾼 슬롯만 보내고 저장되면 true', async () => {
    await loaded();
    const put = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(put.promise);
    const pending = equipMySkin('board', 'neon', 't1');
    expect(getMySkinsState().equipped.board).toBe('neon');
    expect(updateMySkins).toHaveBeenCalledWith({ board: 'neon' }, 't1');
    put.resolve(ok({ board: 'neon' }));
    await expect(pending).resolves.toBe(true);
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { board: 'neon' } });
  });

  it('이미 장착 중이면 보내지 않고 false', async () => {
    await loaded({ block: 'neon' });
    await expect(equipMySkin('block', 'neon', 't1')).resolves.toBe(false);
    expect(updateMySkins).not.toHaveBeenCalled();
  });

  it('실패 — 서버 확정값으로 되돌리고 에러를 다시 던진다(이 슬롯만)', async () => {
    await loaded({ block: 'gameboy', effect: 'neon' });
    updateMySkins.mockRejectedValueOnce(Object.assign(new Error('없는 스킨'), { code: 'USER_SKIN_UNKNOWN' }));
    await expect(equipMySkin('block', 'neon', 't1')).rejects.toMatchObject({ code: 'USER_SKIN_UNKNOWN' });
    expect(getMySkinsState().equipped).toMatchObject({ block: 'gameboy', effect: 'neon' });
  });

  it('다른 슬롯은 따로 — 응답 순서가 바뀌어도 두 선택이 모두 남는다', async () => {
    await loaded();
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const blockReq = equipMySkin('block', 'neon', 't1');
    const effectReq = equipMySkin('effect', 'neon', 't1');
    expect(updateMySkins).toHaveBeenCalledTimes(2);
    b.resolve(ok({ effect: 'neon' }));
    await effectReq;
    a.resolve(ok({ block: 'neon', effect: 'neon' }));
    await blockReq;
    expect(getMySkinsState().equipped).toMatchObject({ block: 'neon', effect: 'neon' });
  });

  it('같은 슬롯은 하나씩 — 진행 중에 고른 것은 마지막 선택만 앞 요청이 끝난 뒤 보낸다(중간 선택은 보내지 않는다)', async () => {
    await loaded();
    const a = deferred<unknown>();
    const c = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(a.promise).mockReturnValueOnce(c.promise);
    const first = equipMySkin('block', 'neon', 't1');
    const middle = equipMySkin('block', 'gameboy', 't1');
    const last = equipMySkin('block', 'high-contrast', 't1');
    expect(updateMySkins).toHaveBeenCalledTimes(1);
    await expect(middle).resolves.toBe(false);
    expect(getMySkinsState().equipped.block).toBe('high-contrast');
    a.resolve(ok({ block: 'neon' }));
    await expect(first).resolves.toBe(false);
    await flush();
    expect(updateMySkins).toHaveBeenCalledTimes(2);
    expect(updateMySkins).toHaveBeenLastCalledWith({ block: 'high-contrast' }, 't1');
    // 앞 요청 응답 사이에도 화면은 마지막 선택
    expect(getMySkinsState().equipped.block).toBe('high-contrast');
    c.resolve(ok({ block: 'high-contrast' }));
    await expect(last).resolves.toBe(true);
    expect(getMySkinsState().equipped.block).toBe('high-contrast');
  });

  it('같은 슬롯: 앞 요청 성공 · 마지막 선택 실패 — 앞 요청 값(서버 저장값)으로', async () => {
    await loaded();
    const a = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(a.promise).mockRejectedValueOnce(new Error('net'));
    const first = equipMySkin('block', 'neon', 't1');
    const second = equipMySkin('block', 'gameboy', 't1');
    a.resolve(ok({ block: 'neon' }));
    await expect(first).resolves.toBe(false);
    await expect(second).rejects.toThrow('net');
    expect(getMySkinsState().equipped.block).toBe('neon');
  });

  it('같은 슬롯: 둘 다 실패 — 저장된 적 없는 값이 남지 않고 확정값으로', async () => {
    await loaded();
    updateMySkins.mockRejectedValueOnce(new Error('net')).mockRejectedValueOnce(new Error('net'));
    const first = equipMySkin('block', 'neon', 't1');
    const second = equipMySkin('block', 'gameboy', 't1');
    await expect(first).resolves.toBe(false);
    await expect(second).rejects.toThrow('net');
    expect(getMySkinsState().equipped.block).toBe('default');
  });

  it('만료(401) — 확정값으로 되돌리고 expired, 기다리던 선택도 보내지 않고 실패로', async () => {
    await loaded();
    updateMySkins.mockRejectedValueOnce(expired());
    const first = equipMySkin('board', 'neon', 't1');
    const second = equipMySkin('board', 'gameboy', 't1');
    await expect(first).rejects.toMatchObject({ status: 401 });
    await expect(second).rejects.toMatchObject({ status: 401 });
    expect(updateMySkins).toHaveBeenCalledTimes(1);
    expect(getMySkinsState()).toMatchObject({ status: 'expired', equipped: { board: 'default' } });
  });

  it('장착 중 로그아웃 — 늦은 성공·실패 모두 게스트 상태를 바꾸지 않고 알리지 않는다(false)', async () => {
    await loaded();
    const s = deferred<unknown>();
    const f = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(s.promise).mockReturnValueOnce(f.promise);
    const success = equipMySkin('block', 'neon', 't1');
    const failure = equipMySkin('effect', 'neon', 't1');
    resetMySkins();
    s.resolve(ok({ block: 'neon' }));
    f.reject(new Error('net'));
    await expect(success).resolves.toBe(false);
    await expect(failure).resolves.toBe(false);
    expect(getMySkinsState()).toMatchObject({ status: 'guest', equipped: base, catalog: null });
  });

  it('장착 진행 중 다른 토큰으로 다시 불러오면 이전 진행·대기를 지운다 — 새 세대는 바로 보내고 실패하면 새 확정값으로', async () => {
    await loaded({}, 'a');
    updateMySkins.mockReturnValueOnce(new Promise(() => {}));
    void equipMySkin('block', 'neon', 'a');
    const waiting = equipMySkin('block', 'gameboy', 'a');
    await loaded({ block: 'high-contrast' }, 'b');
    await expect(waiting).resolves.toBe(false);
    updateMySkins.mockRejectedValueOnce(new Error('net'));
    await expect(equipMySkin('block', 'neon', 'b')).rejects.toThrow('net');
    expect(updateMySkins).toHaveBeenLastCalledWith({ block: 'neon' }, 'b');
    expect(getMySkinsState().equipped.block).toBe('high-contrast');
  });
});
