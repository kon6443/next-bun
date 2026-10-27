// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value, signIn: vi.fn() }));
const getTetrisSkinCatalog = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({ getTetrisSkinCatalog }));
const getMySkins = vi.hoisted(() => vi.fn());
const updateMySkins = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ getMySkins, updateMySkins }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: toastSuccess } }));
const startLogin = vi.hoisted(() => vi.fn());
vi.mock('@/app/auth/useKakaoLogin', () => ({ useKakaoLogin: () => ({ start: startLogin, isStarting: false }) }));

import { ApiError } from '@/types/api';
import { __resetMySkinsForTests, resetMySkins } from '../lib/mySkins';
import SkinsCatalogView, { unlockLabel } from './SkinsCatalogView';

const item = (id: string, unlock: string, owned: boolean, equipped = false) => ({ id, unlock, owned, equipped });
const catalog = (signedIn: boolean) => ({
  code: 'SUCCESS',
  message: '',
  data: {
    signedIn,
    slots: [
      {
        slot: 'block',
        items: [item('default', 'default', signedIn, signedIn), item('neon', 'free', signedIn), item('gold-2027', 'attendance-30', false)],
      },
      { slot: 'effect', items: [item('default', 'default', signedIn, signedIn)] },
      { slot: 'board', items: [item('default', 'default', signedIn, signedIn), item('gameboy', 'free', signedIn)] },
      { slot: 'background', items: [item('default', 'default', signedIn, signedIn)] },
    ],
  },
});
const equipped = { block: 'default', effect: 'default', board: 'default', background: 'default' };
const mine = (eq = equipped) => ({ code: 'SUCCESS', message: '', data: { equipped: eq, catalog: { block: [], effect: [], board: [], background: [] } } });

beforeAll(() => {
  const ctx: object = new Proxy({}, { get: () => () => ctx, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
});
beforeEach(() => {
  __resetMySkinsForTests();
  getTetrisSkinCatalog.mockReset();
  getMySkins.mockReset();
  updateMySkins.mockReset();
  startLogin.mockReset();
});
afterEach(() => {
  session.value = { data: null, status: 'unauthenticated' };
});
const login = () => {
  session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
};

describe('스킨 도감 (D-005)', () => {
  it('획득 방법 문구 — 모르는 unlock은 안전한 폴백', () => {
    expect(unlockLabel('default')).toBe('기본 제공');
    expect(unlockLabel('free')).toBe('누구나 무료');
    expect(unlockLabel('attendance-30')).toBe('곧 공개');
  });

  it('게스트 — 전체 목록·얻는 방법은 보이고, 보유 배지·장착 버튼 없이 로그인 유도', async () => {
    getTetrisSkinCatalog.mockResolvedValue(catalog(false));
    render(<SkinsCatalogView />);
    const neon = await screen.findByTestId('catalog-block-neon');
    expect(getTetrisSkinCatalog).toHaveBeenCalledWith(undefined);
    expect(within(neon).getByText('누구나 무료')).toBeTruthy();
    expect(within(neon).queryByText(/보유/)).toBeNull();
    expect(within(neon).queryByRole('button', { name: '장착' })).toBeNull();
    // 보유 정보가 없으니 보유·미보유 필터도 없다 (UX 점검)
    expect(screen.queryByRole('group', { name: '보기' })).toBeNull();
    window.history.pushState({}, '', '/games/tetris/skins');
    fireEvent.click(screen.getByRole('button', { name: '카카오로 로그인' }));
    expect(startLogin).toHaveBeenCalledWith({ callbackUrl: '/games/tetris/skins' });
  });

  it('로그인 — 슬롯별 보유 수, 배지는 글자로(색만 아님), 장착하면 바로 장착 중으로(모달과 같은 저장소)', async () => {
    login();
    getTetrisSkinCatalog.mockResolvedValue(catalog(true));
    getMySkins.mockResolvedValue(mine());
    updateMySkins.mockResolvedValue(mine({ ...equipped, block: 'neon' }));
    render(<SkinsCatalogView />);
    const neon = await screen.findByTestId('catalog-block-neon');
    expect(getTetrisSkinCatalog).toHaveBeenCalledWith('tok');
    expect(within(screen.getByLabelText('슬롯별 보유')).getByText('2/3')).toBeTruthy();
    expect(within(neon).getByText('✓ 보유')).toBeTruthy();
    expect(within(screen.getByTestId('catalog-block-gold-2027')).getByText('🔒 미보유')).toBeTruthy();
    expect(within(screen.getByTestId('catalog-block-default')).getByText('● 장착 중')).toBeTruthy();
    await waitFor(() => expect(getMySkins).toHaveBeenCalled());
    await act(async () => {
      fireEvent.click(within(neon).getByRole('button', { name: '장착' }));
    });
    expect(updateMySkins).toHaveBeenCalledWith({ block: 'neon' }, 'tok');
    expect(within(screen.getByTestId('catalog-block-neon')).getByText('● 장착 중')).toBeTruthy();
  });

  it('필터 — 보유·미보유', async () => {
    login();
    getTetrisSkinCatalog.mockResolvedValue(catalog(true));
    getMySkins.mockResolvedValue(mine());
    render(<SkinsCatalogView />);
    await screen.findByTestId('catalog-block-neon');
    fireEvent.click(screen.getByRole('button', { name: '미보유' }));
    expect(screen.queryByTestId('catalog-block-neon')).toBeNull();
    expect(screen.getByTestId('catalog-block-gold-2027')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '보유' }));
    expect(screen.getByTestId('catalog-block-neon')).toBeTruthy();
    expect(screen.queryByTestId('catalog-block-gold-2027')).toBeNull();
  });

  it('모르는 id(서버가 먼저 추가)는 기본 미리보기 + id로 보이고 깨지지 않는다', async () => {
    getTetrisSkinCatalog.mockResolvedValue(catalog(false));
    render(<SkinsCatalogView />);
    const gold = await screen.findByTestId('catalog-block-gold-2027');
    expect(within(gold).getByText(/미리보기 준비 중 · gold-2027/)).toBeTruthy();
    expect(within(gold).getByText('곧 공개')).toBeTruthy();
  });

  it('로그인 만료(401) — 게스트 도감으로 다시 받고 다시 로그인하라고 알린다', async () => {
    login();
    getTetrisSkinCatalog.mockRejectedValueOnce(new ApiError('AUTH_UNAUTHORIZED', 'x', 401)).mockResolvedValueOnce(catalog(false));
    getMySkins.mockResolvedValue(mine());
    render(<SkinsCatalogView />);
    await screen.findByTestId('catalog-block-neon');
    expect(getTetrisSkinCatalog.mock.calls).toEqual([['tok'], []]);
    expect(screen.getByText('로그인이 만료됐어요. 다시 로그인하면 내 스킨이 보여요.')).toBeTruthy();
    expect(within(screen.getByTestId('catalog-block-neon')).queryByRole('button', { name: '장착' })).toBeNull();
  });

  it('슬롯 탭은 화살표 키로 옮겨 다닌다(포커스도 따라간다)', async () => {
    getTetrisSkinCatalog.mockResolvedValue(catalog(false));
    render(<SkinsCatalogView />);
    await screen.findByTestId('catalog-block-neon');
    const blockTab = screen.getByRole('tab', { name: '블록' });
    blockTab.focus();
    fireEvent.keyDown(blockTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '연출' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '연출' }));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(screen.getByRole('tab', { name: '배경' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '블록' }).getAttribute('aria-selected')).toBe('true');
  });

  it('내 장착 조회가 일시 실패면 장착 버튼을 잠그고 이유와 다시 불러오기를 보인다', async () => {
    login();
    getTetrisSkinCatalog.mockResolvedValue(catalog(true));
    getMySkins.mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(mine());
    render(<SkinsCatalogView />);
    expect(await screen.findByText('내 장착 정보를 불러오지 못해 지금은 장착할 수 없어요.')).toBeTruthy();
    const equip = within(screen.getByTestId('catalog-block-neon')).getByRole('button', { name: '장착' });
    expect(equip).toBeDisabled();
    fireEvent.click(equip);
    expect(updateMySkins).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    });
    expect(getMySkins).toHaveBeenCalledTimes(2);
    expect(within(screen.getByTestId('catalog-block-neon')).getByRole('button', { name: '장착' })).toBeEnabled();
  });

  it('내 장착 조회가 만료(401)면 도감은 정상이어도 만료 안내 — 장착 버튼 없이', async () => {
    login();
    getTetrisSkinCatalog.mockResolvedValue(catalog(true));
    getMySkins.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', 'x', 401));
    render(<SkinsCatalogView />);
    expect(await screen.findByText('로그인이 만료됐어요. 다시 로그인하면 내 스킨이 보여요.')).toBeTruthy();
    // 만료 안내는 내 장착 조회만으로 먼저 뜰 수 있다 — 도감 목록이 그려진 뒤를 본다
    const neon = await screen.findByTestId('catalog-block-neon');
    expect(within(neon).queryByRole('button', { name: '장착' })).toBeNull();
  });

  it('장착이 저장되면 성공 토스트, 응답 전에 세대가 바뀌면(로그아웃 등) 알리지 않는다', async () => {
    login();
    getTetrisSkinCatalog.mockResolvedValue(catalog(true));
    getMySkins.mockResolvedValue(mine());
    let resolvePut!: (v: unknown) => void;
    updateMySkins.mockReturnValueOnce(new Promise((r) => (resolvePut = r))).mockResolvedValueOnce(mine({ ...equipped, board: 'gameboy' }));
    render(<SkinsCatalogView />);
    const neon = await screen.findByTestId('catalog-block-neon');
    await waitFor(() => expect(within(neon).getByRole('button', { name: '장착' })).toBeEnabled());
    toastSuccess.mockReset();
    fireEvent.click(within(neon).getByRole('button', { name: '장착' }));
    await act(async () => {
      resetMySkins();
      resolvePut(mine({ ...equipped, block: 'neon' }));
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('레벨·포인트(skin-levels) — 보유 포인트, 카드마다 내 레벨, [레벨·강화]로 그 아이템의 미리보기·강화', async () => {
    login();
    getTetrisSkinCatalog.mockResolvedValue({ ...catalog(true), data: { ...catalog(true).data, maxLevel: 5, levelCosts: [100_000, 200_000, 700_000, 2_000_000] } });
    const level = (id: string, lv: number, nextCost: number | null) => ({ id, owned: true, unlock: 'free', level: lv, nextCost });
    getMySkins.mockResolvedValue({
      code: 'SUCCESS',
      message: '',
      data: {
        equipped,
        catalog: { block: [level('default', 1, 100_000), level('neon', 4, 2_000_000)], effect: [], board: [], background: [] },
        points: { balance: 2_500_000, earned: 3_500_000, spent: 1_000_000 },
      },
    });
    render(<SkinsCatalogView />);
    expect(await screen.findByTestId('catalog-points')).toHaveTextContent('2,500,000 P');
    expect(screen.getByTestId('catalog-block-neon')).toHaveTextContent('Lv4');
    // 처음 패널은 이 슬롯의 장착 아이템
    expect(screen.getByTestId('skin-upgrade-block-default')).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('catalog-block-neon')).getByRole('button', { name: '레벨·강화' }));
    const panel = screen.getByTestId('skin-upgrade-block-neon');
    expect(panel).toHaveTextContent('Lv4 → Lv5 · 2,000,000 P');
    expect(within(panel).getByRole('button', { name: '강화' })).not.toBeDisabled();
  });

  it('게스트 도감 — 레벨 비용은 levelCosts로 안내, 강화 버튼 없음', async () => {
    getTetrisSkinCatalog.mockResolvedValue({ ...catalog(false), data: { ...catalog(false).data, maxLevel: 5, levelCosts: [100_000, 200_000, 700_000, 2_000_000], points: null } });
    render(<SkinsCatalogView />);
    fireEvent.click(within(await screen.findByTestId('catalog-block-neon')).getByRole('button', { name: '레벨·강화' }));
    const panel = screen.getByTestId('skin-upgrade-block-neon');
    expect(panel).toHaveTextContent('Lv2까지 100,000 P');
    expect(within(panel).queryByRole('button', { name: '강화' })).toBeNull();
  });
});

