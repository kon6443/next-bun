// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ value: { data: null as unknown, status: 'unauthenticated' } }));
vi.mock('next-auth/react', () => ({ useSession: () => session.value, signIn: vi.fn() }));
const getMySkins = vi.hoisted(() => vi.fn());
const upgradeMySkin = vi.hoisted(() => vi.fn());
vi.mock('@/services/userService', () => ({ getMySkins, updateMySkins: vi.fn(), upgradeMySkin }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

import { ApiError } from '@/types/api';
import { __resetMySkinsForTests, syncPointsAfterScore } from '../lib/mySkins';
import { TetrisSettingsSheet } from './TetrisSettingsSheet';

const equipped = { block: 'neon', effect: 'default', board: 'default', background: 'default' };
const response = (neon: { level: number; nextCost: number | null }, balance: number) => ({
  code: 'SUCCESS',
  data: {
    equipped,
    equippedLevels: { block: neon.level, effect: 1, board: 1, background: 1 },
    catalog: {
      block: [
        { id: 'default', owned: true, unlock: 'default', level: 1, nextCost: 100_000 },
        { id: 'neon', owned: true, unlock: 'free', ...neon },
      ],
      effect: [{ id: 'default', owned: true, unlock: 'default', level: 1, nextCost: 100_000 }],
      board: [{ id: 'default', owned: true, unlock: 'default', level: 1, nextCost: 100_000 }],
      background: [{ id: 'default', owned: true, unlock: 'default', level: 1, nextCost: 100_000 }],
    },
    // 적립은 고정(이 테스트 동안 점수 등록 없음), 소비는 잔액에서 거꾸로 — 강화하면 소비가 늘고 잔액이 준다
    points: { balance, earned: 10_000_000, spent: 10_000_000 - balance },
  },
  message: '',
});

beforeAll(() => {
  const ctx: object = new Proxy({}, { get: () => () => ctx, set: () => true });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
});
beforeEach(() => {
  __resetMySkinsForTests();
  getMySkins.mockReset();
  upgradeMySkin.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});
afterEach(() => {
  session.value = { data: null, status: 'unauthenticated' };
});

async function openSkin(controls?: 'edit' | 'next-game' | 'locked') {
  session.value = { data: { user: { accessToken: 'tok' } }, status: 'authenticated' };
  await act(async () => {
    render(<TetrisSettingsSheet onClose={() => {}} initialGroup="skin" controls={controls} />);
  });
  return screen.getByTestId('skin-upgrade-block-neon');
}

describe('스킨 강화 (skin-levels) — 설정 시트의 스킨 상세', () => {
  it('지금 레벨·다음 비용·보유 포인트, [강화] → 같은 자리 확인 → 강화하기면 목표 레벨로 보내고 레벨이 오른다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 2, nextCost: 200_000 }, 250_000));
    const panel = await openSkin();
    expect(panel.textContent).toContain('Lv2');
    expect(panel.textContent).toContain('Lv2 → Lv3 · 200,000 P');
    expect(panel.textContent).toContain('보유 250,000 P');
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    // 확인 단계 — 바로 보내지 않는다, 대화상자를 겹치지 않는다
    expect(upgradeMySkin).not.toHaveBeenCalled();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(panel.textContent).toContain('200,000 P를 써서 Lv3로 강화할까요?');
    upgradeMySkin.mockResolvedValueOnce(response({ level: 3, nextCost: 700_000 }, 50_000));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: '강화하기' }));
    });
    expect(upgradeMySkin).toHaveBeenCalledWith({ slot: 'block', skinId: 'neon', level: 3 }, 'tok');
    expect(toast.success).toHaveBeenCalledWith('블록 네온 Lv3 강화 완료!');
    const after = screen.getByTestId('skin-upgrade-block-neon');
    expect(after.textContent).toContain('Lv3 → Lv4 · 700,000 P');
    expect(after.textContent).toContain('보유 50,000 P');
    // 카드에도 새 레벨
    expect(screen.getByTestId('skin-item-block-neon').textContent).toContain('Lv3');
  });

  it('확인 단계에서 취소하면 보내지 않고 [강화]로 돌아간다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 100_000));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    fireEvent.click(within(panel).getByRole('button', { name: '취소' }));
    expect(within(panel).getByRole('button', { name: '강화' })).toBeTruthy();
    expect(upgradeMySkin).not.toHaveBeenCalled();
  });

  it('포인트 부족 — 버튼이 잠기고 모자란 만큼 안내', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 3, nextCost: 700_000 }, 650_000));
    const panel = await openSkin();
    expect(within(panel).getByRole('button', { name: '강화' })).toBeDisabled();
    expect(panel.textContent).toContain('50,000 P 더 필요해요');
  });

  it('최고 레벨 — 강화 버튼 없이 "최고 레벨"', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 5, nextCost: null }, 9_000_000));
    const panel = await openSkin();
    expect(within(panel).queryByRole('button', { name: '강화' })).toBeNull();
    expect(panel.textContent).toContain('최고 레벨이에요.');
  });

  it.each(['next-game', 'locked'] as const)('판 도중(%s) — 레벨만 보이고 강화는 숨긴다', async (controls) => {
    getMySkins.mockResolvedValueOnce(response({ level: 2, nextCost: 200_000 }, 9_000_000));
    const panel = await openSkin(controls);
    expect(panel.textContent).toContain('Lv2');
    expect(within(panel).queryByRole('button', { name: '강화' })).toBeNull();
    expect(panel.textContent).toContain('판이 끝난 뒤 강화할 수 있어요.');
  });

  it('서버 409 포인트 부족 — 안내 토스트, 확인 단계를 닫는다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 100_000));
    const panel = await openSkin();
    upgradeMySkin.mockRejectedValueOnce(new ApiError('USER_POINTS_INSUFFICIENT', '부족', 409, undefined, { balance: 10, cost: 100_000 }));
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: '강화하기' }));
    });
    expect(toast.error).toHaveBeenCalledWith('포인트가 부족해요.');
    expect(panel.textContent).toContain('보유 10 P');
    expect(within(panel).getByRole('button', { name: '강화' })).toBeDisabled();
  });

  it('레벨 미리보기 — Lv 칩을 누르면 그 레벨의 설명(지금 레벨 위는 "미리보기")', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 2, nextCost: 200_000 }, 0));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: 'Lv5' }));
    expect(within(panel).getByRole('button', { name: 'Lv5' }).getAttribute('aria-pressed')).toBe('true');
    expect(panel.textContent).toContain('Lv5: 반짝이는 별 · 쌓인 블록 반짝임 (미리보기)');
  });

  it('게스트 — 미리보기만, 로그인하면 강화할 수 있다고 안내', async () => {
    await act(async () => {
      render(<TetrisSettingsSheet onClose={() => {}} initialGroup="skin" />);
    });
    const panel = screen.getByTestId('skin-upgrade-block-default');
    expect(within(panel).queryByRole('button', { name: '강화' })).toBeNull();
    expect(panel.textContent).toContain('로그인하면 테트리스 점수로 강화할 수 있어요');
  });

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

  it('강화가 끝나면 포커스는 [강화]로 — 만렙이 돼 버튼이 없으면 레벨 영역으로(대화상자 안에서 body로 빠지지 않게)', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 3, nextCost: 700_000 }, 3_000_000));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    upgradeMySkin.mockResolvedValueOnce(response({ level: 4, nextCost: 2_000_000 }, 2_300_000));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: '강화하기' }));
      await nextFrame();
    });
    expect(document.activeElement).toBe(within(screen.getByTestId('skin-upgrade-block-neon')).getByRole('button', { name: '강화' }));
    // 포커스를 옮긴 한 번뿐 — 다른 곳으로 옮긴 뒤 아무 렌더(Lv 칩)에 포커스를 다시 가져가지 않는다
    const chip = within(screen.getByTestId('skin-upgrade-block-neon')).getByRole('button', { name: 'Lv2' });
    chip.focus();
    await act(async () => {
      fireEvent.click(chip);
      await nextFrame();
    });
    expect(document.activeElement).toBe(chip);
    fireEvent.click(within(screen.getByTestId('skin-upgrade-block-neon')).getByRole('button', { name: '강화' }));
    upgradeMySkin.mockResolvedValueOnce(response({ level: 5, nextCost: null }, 300_000));
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('skin-upgrade-block-neon')).getByRole('button', { name: '강화하기' }));
      await nextFrame();
    });
    expect(document.activeElement).toBe(screen.getByTestId('skin-upgrade-block-neon'));
  });

  it('확인 단계의 Esc는 취소 — 설정 시트는 그대로 열려 있다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 100_000));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    await act(async () => {
      fireEvent.keyDown(within(panel).getByRole('button', { name: '강화하기' }), { key: 'Escape' });
      await nextFrame();
    });
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: '강화하기' })).toBeNull();
    expect(document.activeElement).toBe(within(panel).getByRole('button', { name: '강화' }));
  });

  it('강화 뒤 잔액이 모자라 [강화]가 잠기면 포커스는 레벨 영역으로 — 잠긴 버튼에 두면 body로 빠진다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 100_000));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    upgradeMySkin.mockResolvedValueOnce(response({ level: 2, nextCost: 200_000 }, 0));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: '강화하기' }));
      await nextFrame();
    });
    const after = screen.getByTestId('skin-upgrade-block-neon');
    expect(within(after).getByRole('button', { name: '강화' })).toBeDisabled();
    expect(document.activeElement).toBe(after);
  });

  it('서버 409 포인트 부족으로 잠겨도 포커스는 레벨 영역으로', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 100_000));
    const panel = await openSkin();
    upgradeMySkin.mockRejectedValueOnce(new ApiError('USER_POINTS_INSUFFICIENT', '부족', 409, undefined, { balance: 10, cost: 100_000 }));
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    await act(async () => {
      fireEvent.click(within(panel).getByRole('button', { name: '강화하기' }));
      await nextFrame();
    });
    expect(document.activeElement).toBe(screen.getByTestId('skin-upgrade-block-neon'));
  });

  it('보내는 중 Esc — 확인 단계도 설정 시트도 닫지 않는다(포커스가 [강화하기]에 남는다), 결과가 오면 닫힌다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 300_000));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    let resolve!: (v: unknown) => void;
    upgradeMySkin.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const confirm = within(panel).getByRole('button', { name: '강화하기' });
    confirm.focus();
    await act(async () => {
      fireEvent.click(confirm);
    });
    const sending = within(panel).getByRole('button', { name: '강화 중…' });
    expect(sending).not.toBeDisabled();
    expect(sending.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(sending);
    fireEvent.click(sending);
    expect(upgradeMySkin).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(sending, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: '강화 중…' })).toBeTruthy();
    await act(async () => {
      resolve(response({ level: 2, nextCost: 200_000 }, 200_000));
      await nextFrame();
    });
    expect(within(screen.getByTestId('skin-upgrade-block-neon')).queryByRole('button', { name: '강화하기' })).toBeNull();
  });

  it('확인 단계가 열린 채 레벨이 바뀌면(다른 탭 강화를 다시 맞춤) 확인을 닫고 포커스는 [강화]로 — 그 뒤 렌더가 포커스를 빼앗지 않는다', async () => {
    getMySkins.mockResolvedValueOnce(response({ level: 1, nextCost: 100_000 }, 5_000_000));
    const panel = await openSkin();
    fireEvent.click(within(panel).getByRole('button', { name: '강화' }));
    expect(within(panel).getByRole('button', { name: '강화하기' })).toBeTruthy();
    getMySkins.mockResolvedValueOnce(response({ level: 3, nextCost: 700_000 }, 4_700_000));
    await act(async () => {
      syncPointsAfterScore({ earned: 1, balance: 1 });
      await new Promise((r) => setTimeout(r, 0));
      await nextFrame();
    });
    const after = screen.getByTestId('skin-upgrade-block-neon');
    expect(after.textContent).toContain('Lv3 → Lv4');
    const upgradeButton = within(after).getByRole('button', { name: '강화' });
    expect(document.activeElement).toBe(upgradeButton);
    // 다른 곳으로 포커스를 옮긴 뒤 아무 렌더(Lv 칩) — 포커스를 다시 가져가지 않는다
    const chip = within(after).getByRole('button', { name: 'Lv5' });
    chip.focus();
    fireEvent.click(chip);
    expect(document.activeElement).toBe(chip);
  });
});

