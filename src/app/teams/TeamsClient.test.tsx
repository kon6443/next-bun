// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import type { Session } from 'next-auth';
import TeamsClient from './TeamsClient';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';
import { NetworkError } from '@/types/api';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { accessToken: 'tok' } }, status: 'authenticated' }),
}));

const session = { user: { accessToken: 'tok', name: '사용자' }, expires: '' } as unknown as Session;

afterEach(cleanup);

describe('TeamsClient — 팀 목록 조회 실패', () => {
  it('오류와 함께 "다시 시도"를 보이고, 누르면 다시 조회한다', () => {
    const onRetry = vi.fn();
    render(<TeamsClient session={session} initialTeams={[]} error="네트워크 오류" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('네트워크 오류');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('useAuthenticatedFetch — 네트워크 실패 문구', () => {
  it('네트워크 실패(NetworkError)면 브라우저 영문 대신 한국어 안내를 오류로 둔다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() =>
      useAuthenticatedFetch(() => Promise.reject(new NetworkError(new TypeError('Failed to fetch')))),
    );
    await waitFor(() => expect(result.current.error).toBe('네트워크 연결을 확인해주세요.'));
  });
});
