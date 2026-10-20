// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: vi.fn(), isStarting: false }) }));

import { BoardLoadError } from './BoardLoadError';

afterEach(cleanup);

describe('BoardLoadError', () => {
  it('조회 실패면 이유와 "다시 시도"를 보이고, 누르면 다시 조회한다', () => {
    const onRetry = vi.fn();
    render(<BoardLoadError message="네트워크 연결을 확인해주세요." isAuthRequired={false} onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('네트워크 연결을 확인해주세요.');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('다시 해도 같은 오류(잘못된 팀 주소)면 다시 시도 대신 팀 목록으로 안내한다', () => {
    render(<BoardLoadError message="유효하지 않은 팀 ID입니다." isAuthRequired={false} canRetry={false} onRetry={() => {}} />);
    expect(screen.getByRole('link', { name: '팀 목록으로' })).toHaveAttribute('href', '/teams');
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it('로그인 토큰이 없으면 다시 시도 대신 로그인을 안내한다', () => {
    render(<BoardLoadError message="인증이 필요합니다." isAuthRequired onRetry={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent('로그인이 필요합니다');
    expect(screen.getByRole('button', { name: '로그인하기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });
});
