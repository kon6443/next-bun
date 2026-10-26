// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value, signIn: vi.fn() }));
const getMySkins = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ getMySkins, updateMySkins: vi.fn() }));
const startLogin = vi.hoisted(() => vi.fn());
vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: startLogin, isStarting: false }) }));

import { __resetMySkinsForTests } from '../lib/mySkins';
import { MySkinCard } from './MySkinCard';

const equipped = { block: 'neon', effect: 'default', board: 'gameboy', background: 'default' };
const catalog = { block: [{ id: 'neon', owned: true, unlock: 'free' }], effect: [], board: [], background: [] };

beforeAll(() => {
  // jsdom에는 캔버스 2D가 없다 — 미리보기 그리기는 아무것도 하지 않는 대역
  const ctx: object = new Proxy({}, { get: () => () => ctx, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
});
beforeEach(() => {
  __resetMySkinsForTests();
  getMySkins.mockReset();
  startLogin.mockReset();
});
afterEach(() => {
  session.value = { data: null, status: 'unauthenticated' };
});

describe('홈 "내 스킨" 카드 (D-003)', () => {
  it('게스트 — 같은 자리에 "로그인하고 스킨 꾸미기", 도감 링크', () => {
    render(<MySkinCard />);
    expect(screen.getByRole('heading', { name: '로그인하고 스킨 꾸미기' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '카카오로 로그인' }));
    expect(startLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: '도감' }).getAttribute('href')).toBe('/games/tetris/skins');
    expect(screen.queryByRole('button', { name: '바꾸기' })).toBeNull();
  });

  it('로그인 — 지금 장착 요약, "바꾸기"는 설정 시트의 스킨 상세로 바로(←는 설정 목록)', async () => {
    session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
    getMySkins.mockResolvedValue({ code: 'SUCCESS', data: { equipped, catalog }, message: '' });
    await act(async () => {
      render(<MySkinCard />);
    });
    expect(screen.getByRole('heading', { name: '내 스킨' })).toBeTruthy();
    expect(screen.getByTestId('my-skin-card').textContent).toContain('블록 네온');
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: '스킨 슬롯' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '설정 목록으로' }));
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
  });
});
