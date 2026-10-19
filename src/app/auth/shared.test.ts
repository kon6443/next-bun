// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

const { signInMock } = vi.hoisted(() => ({ signInMock: vi.fn() }));
vi.mock('next-auth/react', () => ({ signIn: signInMock }));
vi.mock('@/app/components/AuthLoadingOverlay', () => ({ AUTH_LOADING_KEY: 'auth-loading', clearAuthLoading: vi.fn() }));

import { startKakaoLogin } from './shared';

const dispatchPageShow = (persisted: boolean) => {
  const event = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: persisted });
  window.dispatchEvent(event);
};

describe('startKakaoLogin 잠금', () => {
  it('버튼 훅이 없는 진입점에서 시작했어도 bfcache 복원 시 잠금이 풀린다', async () => {
    signInMock.mockResolvedValue(undefined);
    expect(await startKakaoLogin({ callbackUrl: '/teams/invite/accept?token=t' })).toBe(true);
    expect(await startKakaoLogin()).toBe(false);

    dispatchPageShow(false);
    expect(await startKakaoLogin()).toBe(false);

    dispatchPageShow(true);
    expect(await startKakaoLogin()).toBe(true);
  });
});
