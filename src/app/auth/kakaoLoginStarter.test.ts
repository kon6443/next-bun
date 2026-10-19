import { describe, it, expect, vi } from 'vitest';
import { createLoginStarter } from './kakaoLoginStarter';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLoginStarter', () => {
  it('진행 중에 다시 누르면 signIn 을 한 번만 보낸다', async () => {
    const starter = createLoginStarter();
    const pending = deferred();
    const signIn = vi.fn(() => pending.promise);

    const first = starter.start({ signIn });
    const second = await starter.start({ signIn });

    expect(second).toBe(false);
    expect(signIn).toHaveBeenCalledTimes(1);
    pending.resolve();
    expect(await first).toBe(true);
  });

  it('성공해도 잠금을 유지한다 (화면이 넘어가는 중)', async () => {
    const starter = createLoginStarter();
    await starter.start({ signIn: () => Promise.resolve() });
    expect(starter.isInFlight()).toBe(true);
    expect(await starter.start({ signIn: vi.fn() })).toBe(false);
  });

  it('signIn 이 실패하면 잠금을 풀고 표시를 정리한 뒤 에러를 던진다 — 다시 누를 수 있다', async () => {
    const starter = createLoginStarter();
    const onStart = vi.fn();
    const onReset = vi.fn();

    await expect(
      starter.start({ signIn: () => Promise.reject(new Error('network')), onStart, onReset }),
    ).rejects.toThrow('network');
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(starter.isInFlight()).toBe(false);

    const retry = vi.fn(() => Promise.resolve());
    expect(await starter.start({ signIn: retry })).toBe(true);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('reset 으로 잠금을 풀 수 있다 (bfcache 복원)', async () => {
    const starter = createLoginStarter();
    await starter.start({ signIn: () => Promise.resolve() });
    const onReset = vi.fn();
    starter.reset(onReset);
    expect(starter.isInFlight()).toBe(false);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
