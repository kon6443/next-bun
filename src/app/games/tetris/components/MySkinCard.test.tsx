// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value, signIn: vi.fn() }));
const getMySkins = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ getMySkins, updateMySkins: vi.fn() }));
const startLogin = vi.hoisted(() => vi.fn());
vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: startLogin, isStarting: false }) }));

import { __resetMySkinsForTests } from '../lib/mySkins';
import { MySkinButton } from './MySkinCard';

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

describe('홈 상단 바 "내 스킨" 아이콘 버튼 (tetris-home-chat)', () => {
  it('게스트 — 같은 시트를 열고 시트 안에서 로그인을 권한다', () => {
    render(<MySkinButton />);
    const button = screen.getByRole('button', { name: '내 스킨 · 로그인하고 스킨 꾸미기' });
    expect(button.className).toContain('h-11 w-11');
    fireEvent.click(button);
    const sheet = screen.getByRole('dialog', { name: '스킨' });
    fireEvent.click(within(sheet).getByRole('button', { name: '카카오로 로그인' }));
    expect(startLogin).toHaveBeenCalledTimes(1);
  });

  it('로그인 — 접근 이름에 블록 스킨·레벨·포인트, 누르면 설정 시트의 스킨 상세로 바로(←는 설정 목록)', async () => {
    session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
    getMySkins.mockResolvedValue({ code: 'SUCCESS', data: { equipped, catalog, points: { balance: 12_345, earned: 20_000, spent: 7_655 } }, message: '' });
    await act(async () => {
      render(<MySkinButton />);
    });
    const row = screen.getByRole('button', { name: '내 스킨 · 블록 네온 Lv1 · 포인트 12,345 P' });
    // Lv1이면 배지는 없다
    expect(row.textContent).not.toContain('Lv');
    fireEvent.click(row);
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: '스킨 슬롯' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '설정 목록으로' }));
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
  });

  it('스킨 상세로 바로 연 시트를 닫으면 연 버튼으로 포커스가 돌아온다(키보드)', async () => {
    session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
    getMySkins.mockResolvedValue({ code: 'SUCCESS', data: { equipped, catalog, points: { balance: 12_345, earned: 20_000, spent: 7_655 } }, message: '' });
    await act(async () => {
      render(<MySkinButton />);
    });
    const change = screen.getByRole('button', { name: /^내 스킨/ });
    change.focus();
    await act(async () => {
      fireEvent.click(change);
    });
    expect(screen.getByRole('dialog', { name: '스킨' }).contains(document.activeElement)).toBe(true);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(change);
  });

  it('레벨은 장착한 블록 아이템의 것 — 다른 슬롯 레벨이 섞이지 않는다', async () => {
    session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
    getMySkins.mockResolvedValue({
      code: 'SUCCESS',
      data: {
        equipped,
        catalog: { ...catalog, block: [{ id: 'neon', owned: true, unlock: 'free', level: 3 }], board: [{ id: 'gameboy', owned: true, unlock: 'free', level: 5 }] },
      },
      message: '',
    });
    await act(async () => {
      render(<MySkinButton />);
    });
    const button = screen.getByRole('button', { name: '내 스킨 · 블록 네온 Lv3' });
    expect(button.textContent).toContain('Lv3');
  });
});

