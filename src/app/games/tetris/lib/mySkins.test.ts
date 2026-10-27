import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMySkins = vi.fn();
const updateMySkins = vi.fn();
const upgradeRequest = vi.fn();
vi.mock('@/services/userService', () => ({
  getMySkins: (...args: unknown[]) => getMySkins(...args),
  updateMySkins: (...args: unknown[]) => updateMySkins(...args),
  upgradeMySkin: (...args: unknown[]) => upgradeRequest(...args),
}));

import { ApiError } from '@/types/api';
import {
  __resetMySkinsForTests,
  equipMySkin,
  getMySkinsState,
  loadMySkins,
  resetMySkins,
  retryMySkins,
  syncPointsAfterScore,
  upgradeMySkin,
} from './mySkins';

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
  upgradeRequest.mockReset();
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
    // 실패는 마지막 선택 하나로만 알린다(토스트 한 번) — 밀린 앞 선택은 조용히
    await expect(first).resolves.toBe(false);
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

  it('같은 슬롯: 앞 요청 실패 · 마지막 선택 성공 — 앞은 조용히(false), 마지막은 true', async () => {
    await loaded();
    updateMySkins.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(ok({ block: 'gameboy' }));
    const first = equipMySkin('block', 'neon', 't1');
    const second = equipMySkin('block', 'gameboy', 't1');
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
    expect(getMySkinsState().equipped.block).toBe('gameboy');
  });

  it('성공하면 보낸 값이 아니라 서버가 돌려준 장착으로, 응답의 카탈로그도 반영한다', async () => {
    await loaded();
    const updated = { block: [{ id: 'neon', owned: true, unlock: 'free' }], effect: [], board: [], background: [] };
    updateMySkins.mockResolvedValueOnce({ code: 'SUCCESS', message: '', data: { equipped: { ...base, block: 'gameboy' }, catalog: updated } });
    await equipMySkin('block', 'neon', 't1');
    expect(getMySkinsState().equipped.block).toBe('gameboy');
    expect(getMySkinsState().catalog?.block).toEqual(updated.block);
  });

  it('불러온 뒤(ready)가 아니면 보내지 않는다 — 불러오는 중·만료(다른 슬롯에서 만료가 난 뒤 포함)', async () => {
    getMySkins.mockReturnValueOnce(new Promise(() => {}));
    void loadMySkins('t1');
    await expect(equipMySkin('block', 'neon', 't1')).resolves.toBe(false);
    __resetMySkinsForTests();
    await loaded();
    updateMySkins.mockRejectedValueOnce(expired());
    await expect(equipMySkin('board', 'neon', 't1')).rejects.toMatchObject({ status: 401 });
    await expect(equipMySkin('effect', 'neon', 't1')).resolves.toBe(false);
    expect(updateMySkins).toHaveBeenCalledTimes(1);
  });

  it('다른 슬롯에서 만료(401)가 나면 진행 중이던 슬롯의 대기 선택은 보내지 않는다 — 앞 선택은 자기 결과대로, 대기는 조용히', async () => {
    await loaded();
    const blockPut = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(blockPut.promise).mockRejectedValueOnce(expired());
    const b1 = equipMySkin('block', 'neon', 't1');
    const b2 = equipMySkin('block', 'gameboy', 't1');
    await expect(equipMySkin('board', 'neon', 't1')).rejects.toMatchObject({ status: 401 });
    expect(getMySkinsState().status).toBe('expired');
    blockPut.resolve(ok({ block: 'neon' }));
    await expect(b1).resolves.toBe(true);
    await expect(b2).resolves.toBe(false);
    expect(updateMySkins.mock.calls.map(([body]) => body)).toEqual([{ block: 'neon' }, { board: 'neon' }]);
    expect(getMySkinsState()).toMatchObject({ status: 'expired', equipped: { block: 'neon', board: 'default' } });
  });

  it('불러오기 실패(error)면 장착하지 않는다', async () => {
    getMySkins.mockRejectedValueOnce(new Error('down'));
    await loadMySkins('t1');
    await expect(equipMySkin('block', 'neon', 't1')).resolves.toBe(false);
    expect(updateMySkins).not.toHaveBeenCalled();
  });
});

describe('내 스킨 — 레벨·포인트·강화 (skin-levels)', () => {
  const leveled = (blockNeon: { level: number; nextCost: number | null }, balance = 500_000) => ({
    code: 'SUCCESS',
    data: {
      equipped: { ...base, block: 'neon' },
      equippedLevels: { block: blockNeon.level, effect: 1, board: 1, background: 1 },
      catalog: {
        block: [
          { id: 'default', owned: true, unlock: 'default', level: 1, nextCost: 100_000 },
          { id: 'neon', owned: true, unlock: 'free', ...blockNeon },
          { id: 'retro', owned: false, unlock: 'event', level: 1, nextCost: 100_000 },
        ],
        effect: [],
        board: [],
        background: [],
      },
      // 적립 고정 — 소비는 잔액에서 거꾸로(강화하면 소비가 늘고 잔액이 준다)
      points: { balance, earned: 10_000_000, spent: 10_000_000 - balance },
    },
    message: '',
  });

  it('장착 레벨은 장착 id로 카탈로그에서 — 낙관적으로 장착을 바꾸면 바로 그 아이템의 레벨', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 3, nextCost: 700_000 }));
    await loadMySkins('t1');
    expect(getMySkinsState()).toMatchObject({ levels: { block: 3, effect: 1 }, points: { balance: 500_000 } });
    updateMySkins.mockReturnValueOnce(new Promise(() => {}));
    void equipMySkin('block', 'default', 't1');
    expect(getMySkinsState().levels.block).toBe(1);
  });

  it('강화 — 목표 레벨(지금 + 1)로 보내고 응답의 카탈로그·포인트로 바꾼다, 진행 중에는 다른 강화를 보내지 않는다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }));
    await loadMySkins('t1');
    const pending = deferred<unknown>();
    upgradeRequest.mockReturnValueOnce(pending.promise);
    const first = upgradeMySkin('block', 'neon', 't1');
    expect(upgradeRequest).toHaveBeenCalledWith({ slot: 'block', skinId: 'neon', level: 3 }, 't1');
    expect(getMySkinsState().upgrading).toBe(true);
    // 중복 클릭·다른 아이템 — 잔액을 함께 쓰니 보내지 않는다
    await expect(upgradeMySkin('block', 'default', 't1')).resolves.toBe('skipped');
    expect(upgradeRequest).toHaveBeenCalledTimes(1);
    pending.resolve(leveled({ level: 3, nextCost: 700_000 }, 300_000));
    await expect(first).resolves.toBe('upgraded');
    expect(getMySkinsState()).toMatchObject({ upgrading: false, levels: { block: 3 }, points: { balance: 300_000 } });
  });

  it('보내지 않는 경우 — 미보유·만렙·불러오기 전', async () => {
    await expect(upgradeMySkin('block', 'neon', 't1')).resolves.toBe('skipped');
    getMySkins.mockResolvedValueOnce(leveled({ level: 5, nextCost: null }));
    await loadMySkins('t1');
    await expect(upgradeMySkin('block', 'neon', 't1')).resolves.toBe('skipped');
    await expect(upgradeMySkin('block', 'retro', 't1')).resolves.toBe('skipped');
    expect(upgradeRequest).not.toHaveBeenCalled();
  });

  it('포인트 부족 409 — details.balance로 잔액을 맞추고 에러를 다시 던진다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }));
    await loadMySkins('t1');
    upgradeRequest.mockRejectedValueOnce(new ApiError('USER_POINTS_INSUFFICIENT', '부족', 409, undefined, { balance: 1234, cost: 200_000 }));
    const resync = deferred<unknown>();
    getMySkins.mockReturnValueOnce(resync.promise);
    await expect(upgradeMySkin('block', 'neon', 't1')).rejects.toMatchObject({ code: 'USER_POINTS_INSUFFICIENT' });
    expect(getMySkinsState()).toMatchObject({ upgrading: false, points: { balance: 1234 }, levels: { block: 2 } });
    // 잔액만 고치면 적립·소비와 어긋난다 — 서버 값으로 다시 맞춘다
    expect(getMySkins).toHaveBeenCalledTimes(2);
    resync.resolve({ ...leveled({ level: 2, nextCost: 200_000 }), data: { ...leveled({ level: 2, nextCost: 200_000 }).data, points: { balance: 1234, earned: 10_000_000, spent: 9_998_766 } } });
    await flush();
    expect(getMySkinsState().points).toEqual({ balance: 1234, earned: 10_000_000, spent: 9_998_766 });
  });

  it('레벨 어긋남 409(다른 탭에서 강화) — 서버 값으로 다시 불러온다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }));
    await loadMySkins('t1');
    upgradeRequest.mockRejectedValueOnce(new ApiError('USER_SKIN_LEVEL_MISMATCH', '어긋남', 409, undefined, { slot: 'block', id: 'neon', level: 3 }));
    getMySkins.mockResolvedValueOnce(leveled({ level: 3, nextCost: 700_000 }));
    await expect(upgradeMySkin('block', 'neon', 't1')).rejects.toMatchObject({ code: 'USER_SKIN_LEVEL_MISMATCH' });
    await flush();
    expect(getMySkins).toHaveBeenCalledTimes(2);
    expect(getMySkinsState()).toMatchObject({ status: 'ready', levels: { block: 3 } });
  });

  it('강화 중 로그아웃(세대 교체) — 늦은 응답을 반영하지 않는다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }));
    await loadMySkins('t1');
    const pending = deferred<unknown>();
    upgradeRequest.mockReturnValueOnce(pending.promise);
    const run = upgradeMySkin('block', 'neon', 't1');
    resetMySkins();
    pending.resolve(leveled({ level: 3, nextCost: 700_000 }));
    await expect(run).resolves.toBe('skipped');
    expect(getMySkinsState()).toMatchObject({ status: 'guest', points: null });
  });

  it('점수 등록 뒤 — 포인트가 있는 응답이면 서버에서 카탈로그·포인트를 다시 맞춘다(세대·장착 그대로) · 불러오기 전·포인트 없음은 부르지 않는다', async () => {
    syncPointsAfterScore({ earned: 10, balance: 10 });
    expect(getMySkins).not.toHaveBeenCalled();
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 1000));
    await loadMySkins('t1');
    syncPointsAfterScore(null);
    expect(getMySkins).toHaveBeenCalledTimes(1);
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 3500));
    syncPointsAfterScore({ earned: 2500, balance: 3500 });
    await flush();
    expect(getMySkins).toHaveBeenCalledTimes(2);
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { block: 'neon' }, points: { balance: 3500 } });
  });

  it('포인트·레벨이 없는 응답(이 필드 배포 전 서버) — 포인트 null, 레벨 1', async () => {
    await loaded({ block: 'default' });
    expect(getMySkinsState()).toMatchObject({ points: null, levels: { block: 1, effect: 1, board: 1, background: 1 } });
  });

  it('장착 PUT 응답이 강화보다 늦게 와도(강화 전 스냅샷) 레벨·포인트를 되돌리지 않는다 — 레벨은 높은 쪽, 적립·소비는 각각 큰 값', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 1000_000));
    await loadMySkins('t1');
    const put = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(put.promise);
    void equipMySkin('block', 'default', 't1');
    upgradeRequest.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }, 900_000));
    await expect(upgradeMySkin('block', 'neon', 't1')).resolves.toBe('upgraded');
    // PUT 응답 — 서버가 강화 전에 만든 스냅샷(neon Lv1, 소비 100,000)
    put.resolve({ ...leveled({ level: 1, nextCost: 100_000 }, 1000_000), data: { ...leveled({ level: 1, nextCost: 100_000 }, 1000_000).data, equipped: { ...base, block: 'default' } } });
    await flush();
    const after = getMySkinsState();
    expect(after.equipped.block).toBe('default');
    expect(after.catalog?.block.find((x) => x.id === 'neon')).toMatchObject({ level: 2, nextCost: 200_000 });
    expect(after.points).toMatchObject({ balance: 900_000, spent: 9_100_000 });
  });

  it('레벨 어긋남 409 — 세대·장착은 그대로(화면이 기본으로 깜빡이지 않고 진행 중 장착도 살아 있다), 카탈로그만 다시 맞춘다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }));
    await loadMySkins('t1');
    const put = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(put.promise);
    const equipping = equipMySkin('effect', 'neon', 't1');
    upgradeRequest.mockRejectedValueOnce(new ApiError('USER_SKIN_LEVEL_MISMATCH', '어긋남', 409, undefined, { slot: 'block', id: 'neon', level: 3 }));
    const refresh = deferred<unknown>();
    getMySkins.mockReturnValueOnce(refresh.promise);
    await expect(upgradeMySkin('block', 'neon', 't1')).rejects.toMatchObject({ code: 'USER_SKIN_LEVEL_MISMATCH' });
    expect(getMySkinsState()).toMatchObject({ status: 'ready', equipped: { block: 'neon', effect: 'neon' } });
    refresh.resolve(leveled({ level: 3, nextCost: 700_000 }));
    // PUT 응답은 GET과 같은 모양(전체 카탈로그) — 강화 전 스냅샷이어도 레벨은 높은 쪽
    put.resolve({ ...leveled({ level: 2, nextCost: 200_000 }), data: { ...leveled({ level: 2, nextCost: 200_000 }).data, equipped: { ...base, block: 'neon', effect: 'neon' } } });
    await expect(equipping).resolves.toBe(true);
    expect(getMySkinsState()).toMatchObject({ status: 'ready', levels: { block: 3 }, equipped: { effect: 'neon' } });
  });

  it('점수 등록 뒤 다시 맞추기는 등록 응답의 잔액을 쓰지 않는다 — 강화 차감이 반영된 서버 값이 기준', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 150_000));
    await loadMySkins('t1');
    upgradeRequest.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }, 50_000));
    await upgradeMySkin('block', 'neon', 't1');
    expect(getMySkinsState().points).toMatchObject({ balance: 50_000, spent: 9_950_000 });
    // 서버가 강화 전에 만든 등록 응답(잔액 180,000) — 다시 맞춘 GET은 강화·적립 모두 반영(80,000)
    getMySkins.mockResolvedValueOnce({ ...leveled({ level: 2, nextCost: 200_000 }), data: { ...leveled({ level: 2, nextCost: 200_000 }).data, points: { balance: 80_000, earned: 10_030_000, spent: 9_950_000 } } });
    syncPointsAfterScore({ earned: 30_000, balance: 180_000 });
    await flush();
    expect(getMySkinsState().points?.balance).toBe(80_000);
  });

  it('다시 맞추는 GET이 강화 전에 나가 강화 뒤에 오면(강화 전 스냅샷) 통째로 바꾸지 않고 합친다 — 레벨·소비를 되돌리지 않는다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 150_000));
    await loadMySkins('t1');
    const refresh = deferred<unknown>();
    getMySkins.mockReturnValueOnce(refresh.promise);
    syncPointsAfterScore({ earned: 30_000, balance: 180_000 });
    // 강화 응답 — 적립(이번 판 30,000) 전에 서버가 만든 값
    upgradeRequest.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }, 50_000));
    await upgradeMySkin('block', 'neon', 't1');
    // 서버가 강화 전·적립 뒤에 만든 GET(Lv1, 소비 그대로, 적립 +30,000)
    refresh.resolve({ ...leveled({ level: 1, nextCost: 100_000 }), data: { ...leveled({ level: 1, nextCost: 100_000 }).data, points: { balance: 180_000, earned: 10_030_000, spent: 9_850_000 } } });
    await flush();
    // 레벨은 2, 소비는 강화 뒤 값, 적립은 GET 값 — 잔액 = 10,030,000 − 9,950,000
    expect(getMySkinsState()).toMatchObject({ levels: { block: 2 }, points: { balance: 80_000, earned: 10_030_000, spent: 9_950_000 } });
  });

  it('보낸 뒤 강화·장착이 없었으면 다시 맞추는 GET은 서버 값을 그대로 쓴다 — 서버에서 레벨이 내려가도 따라간다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 3, nextCost: 700_000 }));
    await loadMySkins('t1');
    getMySkins.mockResolvedValueOnce(leveled({ level: 2, nextCost: 200_000 }));
    syncPointsAfterScore({ earned: 1, balance: 1 });
    await flush();
    expect(getMySkinsState().levels.block).toBe(2);
  });

  it('소비가 같고 적립이 적은 옛 응답(장착 PUT)이 다시 맞춘 GET보다 늦게 와도 적립을 되돌리지 않는다 — 적립·소비는 각각 큰 값', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 900));
    await loadMySkins('t1');
    const put = deferred<unknown>();
    updateMySkins.mockReturnValueOnce(put.promise);
    void equipMySkin('effect', 'neon', 't1');
    const withPoints = (earned: number, spent: number) => ({
      ...leveled({ level: 1, nextCost: 100_000 }),
      data: { ...leveled({ level: 1, nextCost: 100_000 }).data, equipped: { ...base, block: 'neon', effect: 'neon' }, points: { balance: earned - spent, earned, spent } },
    });
    getMySkins.mockResolvedValueOnce(withPoints(5000, 100));
    syncPointsAfterScore({ earned: 4000, balance: 4900 });
    await flush();
    expect(getMySkinsState().points).toMatchObject({ balance: 4900, earned: 5000 });
    put.resolve(withPoints(1000, 100));
    await flush();
    expect(getMySkinsState().points).toMatchObject({ balance: 4900, earned: 5000, spent: 100 });
  });

  it('다시 맞추는 GET 둘이 순서가 뒤바뀌어 와도 옛 GET이 새 GET을 덮지 않는다', async () => {
    getMySkins.mockResolvedValueOnce(leveled({ level: 1, nextCost: 100_000 }, 900));
    await loadMySkins('t1');
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    getMySkins.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    syncPointsAfterScore({ earned: 4000, balance: 4900 });
    syncPointsAfterScore({ earned: 4000, balance: 8900 });
    const snapshot = (earned: number) => ({ ...leveled({ level: 1, nextCost: 100_000 }), data: { ...leveled({ level: 1, nextCost: 100_000 }).data, points: { balance: earned - 100, earned, spent: 100 } } });
    second.resolve(snapshot(9000));
    await flush();
    first.resolve(snapshot(5000));
    await flush();
    expect(getMySkinsState().points).toMatchObject({ earned: 9000, balance: 8900 });
  });
});

