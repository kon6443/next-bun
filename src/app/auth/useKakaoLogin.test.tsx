// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const startKakaoLogin = vi.fn();
vi.mock('./shared', () => ({
  startKakaoLogin: (...args: unknown[]) => startKakaoLogin(...args),
}));
const toastError = vi.fn();
vi.mock('react-hot-toast', () => ({ default: { error: (...args: unknown[]) => toastError(...args) } }));

import { useKakaoLogin } from './useKakaoLogin';

beforeEach(() => {
  startKakaoLogin.mockReset();
  toastError.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useKakaoLogin', () => {
  it('누르는 즉시 시작 중이 되고, 화면이 넘어가는 동안 유지된다', async () => {
    startKakaoLogin.mockResolvedValue(true);
    const { result } = renderHook(() => useKakaoLogin());
    await act(async () => {
      await result.current.start({ prompt: 'login' });
    });
    expect(startKakaoLogin).toHaveBeenCalledWith({ prompt: 'login' });
    expect(result.current.isStarting).toBe(true);
  });

  it('시작이 실패하면 다시 누를 수 있게 풀고 알린다', async () => {
    startKakaoLogin.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useKakaoLogin());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.isStarting).toBe(false);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('뒤로가기로 bfcache 에서 복원되면 버튼을 다시 활성화한다', async () => {
    startKakaoLogin.mockResolvedValue(true);
    const { result } = renderHook(() => useKakaoLogin());
    await act(async () => {
      await result.current.start();
    });
    act(() => {
      const event = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);
    });
    expect(result.current.isStarting).toBe(false);
  });
});
