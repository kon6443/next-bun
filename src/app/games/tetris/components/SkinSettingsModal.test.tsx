// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value, signIn: vi.fn() }));
const getMySkins = vi.hoisted(() => vi.fn());
const updateMySkins = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ getMySkins, updateMySkins }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { error: toastError } }));

import { ApiError } from '@/types/api';
import { __resetMySkinsForTests } from '../lib/mySkins';
import { SkinSettingsModal } from './SkinSettingsModal';

const equipped = { block: 'default', effect: 'default', board: 'default', background: 'default' };
const item = (id: string, owned = true) => ({ id, owned, unlock: owned ? 'free' : 'achievement' });
const catalog = {
  block: [item('default'), item('gameboy'), item('neon'), item('high-contrast'), item('gold-2027', false)],
  effect: [item('default'), item('neon')],
  board: [item('default'), item('gameboy')],
  background: [item('default'), item('neon')],
};
const ok = (eq = equipped) => ({ code: 'SUCCESS', data: { equipped: eq, catalog }, message: '' });

beforeAll(() => {
  // jsdom에는 캔버스 2D가 없다 — 미리보기 그리기는 아무것도 하지 않는 대역
  const ctx: object = new Proxy({}, { get: () => () => ctx, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
});

beforeEach(() => {
  __resetMySkinsForTests();
  getMySkins.mockReset();
  updateMySkins.mockReset();
  toastError.mockReset();
});
afterEach(() => {
  session.value = { data: null, status: 'unauthenticated' };
});

const login = () => {
  session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
};

describe('스킨 모달', () => {
  it('게스트 — 로그인 안내, 카드를 눌러도 바꾸지 않는다(서버 호출 없음)', () => {
    render(<SkinSettingsModal onClose={() => {}} />);
    expect(screen.getByText(/로그인하면 스킨을 고를 수 있어요/)).toBeTruthy();
    const neon = screen.getByTestId('skin-item-block-neon');
    expect(neon.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(neon);
    expect(updateMySkins).not.toHaveBeenCalled();
    expect(getMySkins).not.toHaveBeenCalled();
    expect(screen.getByTestId('skin-item-block-default').getAttribute('aria-checked')).toBe('true');
  });

  it('로그인 — 서버 카탈로그를 보이고, 고르면 그 슬롯만 PUT하고 바로 장착 표시', async () => {
    login();
    getMySkins.mockResolvedValue(ok());
    updateMySkins.mockResolvedValue(ok({ ...equipped, block: 'neon' }));
    render(<SkinSettingsModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('skin-item-block-gold-2027')).toBeTruthy());
    fireEvent.click(screen.getByTestId('skin-item-block-neon'));
    expect(screen.getByTestId('skin-item-block-neon').getAttribute('aria-checked')).toBe('true');
    expect(updateMySkins).toHaveBeenCalledWith({ block: 'neon' }, 'tok');
    await act(async () => {});
  });

  it('잠긴 아이템은 고를 수 없다(서버 SSOT 보유 여부)', async () => {
    login();
    getMySkins.mockResolvedValue(ok());
    render(<SkinSettingsModal onClose={() => {}} />);
    const locked = await screen.findByTestId('skin-item-block-gold-2027');
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.textContent).toContain('잠김');
    fireEvent.click(locked);
    expect(updateMySkins).not.toHaveBeenCalled();
  });

  it('저장 실패 — 이전 장착으로 되돌리고 서버 메시지로 알린다', async () => {
    login();
    getMySkins.mockResolvedValue(ok());
    updateMySkins.mockRejectedValue(new ApiError('USER_SKIN_NOT_OWNED', '아직 얻지 않은 스킨입니다.', 403));
    render(<SkinSettingsModal onClose={() => {}} />);
    await screen.findByTestId('skin-item-block-gold-2027');
    fireEvent.click(screen.getByTestId('skin-item-block-gameboy'));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('아직 얻지 않은 스킨입니다.'));
    expect(screen.getByTestId('skin-item-block-default').getAttribute('aria-checked')).toBe('true');
  });

  it('슬롯 탭 — 배경 탭은 그 슬롯 아이템만', async () => {
    login();
    getMySkins.mockResolvedValue(ok());
    render(<SkinSettingsModal onClose={() => {}} />);
    await screen.findByTestId('skin-item-block-gold-2027');
    fireEvent.click(screen.getByRole('tab', { name: '배경' }));
    expect(screen.getByTestId('skin-item-background-neon')).toBeTruthy();
    expect(screen.queryByTestId('skin-item-block-neon')).toBeNull();
  });
});
