// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameSettingsButton } from '@/app/games/_shared/components/GameSettingsButton';
import { tetrisSettingsStore } from '../lib/storage';
import { TetrisSettingsSheet } from './TetrisSettingsSheet';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

beforeEach(() => {
  window.localStorage.clear();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});

const openGroup = (id: string) => fireEvent.click(screen.getByTestId(`settings-group-${id}`));

describe('테트리스 설정 시트 (D-001·D-006)', () => {
  it('첫 화면은 그룹 목록 — 스킨이 맨 위, 각 줄에 지금 상태(게스트는 "로그인하고 스킨 꾸미기")', () => {
    tetrisSettingsStore.save({ das: 15, arr: 0 });
    render(<TetrisSettingsSheet onClose={() => {}} />);
    const sheet = screen.getByRole('dialog', { name: '설정' });
    const rows = within(sheet).getAllByTestId(/^settings-group-/).map((row) => row.dataset.testid);
    expect(rows).toEqual(['settings-group-skin', 'settings-group-sound', 'settings-group-controls', 'settings-group-display']);
    expect(screen.getByTestId('settings-group-skin').textContent).toContain('로그인하고 스킨 꾸미기');
    expect(screen.getByTestId('settings-group-sound').textContent).toContain('효과음 꺼짐 · 배경음 꺼짐');
    expect(screen.getByTestId('settings-group-controls').textContent).toContain('DAS 250ms · ARR 즉시');
    // 목록에서는 막대·체크박스가 없다(상세에만)
    expect(within(sheet).queryByRole('slider')).toBeNull();
  });

  it('조작 상세 — 바꾸면 같은 스토어에 저장, ←로 목록에 돌아오면 요약도 바뀌고 누른 줄로 포커스', async () => {
    render(<TetrisSettingsSheet onClose={() => {}} />);
    await act(async () => {
      openGroup('controls');
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    const sheet = screen.getByRole('dialog', { name: '조작' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '설정 목록으로' }));
    fireEvent.change(within(sheet).getByRole('slider', { name: /DAS/ }), { target: { value: '15' } });
    expect(tetrisSettingsStore.get().das).toBe(15);
    expect(within(sheet).queryByText('DAS·ARR은 다음 판부터 적용돼요.')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '설정 목록으로' }));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
    expect(screen.getByTestId('settings-group-controls').textContent).toContain('DAS 250ms');
    expect(document.activeElement).toBe(screen.getByTestId('settings-group-controls'));
  });

  it('싱글 플레이 중 — 바꿀 수 있고 "다음 판부터"를 알린다', () => {
    render(<TetrisSettingsSheet onClose={() => {}} controls="next-game" />);
    openGroup('controls');
    expect(screen.getByText('DAS·ARR은 다음 판부터 적용돼요.')).toBeTruthy();
    expect(screen.getByRole('slider', { name: /ARR/ })).toBeTruthy();
  });

  it('대전 중 — DAS·ARR은 읽기만(막대 없음, 목록 요약에도 표시), 진동은 바꿀 수 있다', () => {
    tetrisSettingsStore.save({ das: 15, arr: 0, vibration: true });
    render(<TetrisSettingsSheet onClose={() => {}} controls="locked" />);
    expect(screen.getByTestId('settings-group-controls').textContent).toContain('대전 중 바꿀 수 없음');
    openGroup('controls');
    expect(screen.queryByRole('slider', { name: /DAS|ARR/ })).toBeNull();
    expect(screen.getByText('250ms')).toBeTruthy();
    expect(screen.getByText('즉시')).toBeTruthy();
    expect(screen.getByText(/대전 중에는 바꿀 수 없어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /진동/ }));
    expect(tetrisSettingsStore.get().vibration).toBe(false);
  });

  it('스킨 상세는 같은 대화상자 안 — 모달을 겹치지 않는다, 처음부터 스킨으로 열 수도 있다(홈 "내 스킨" 카드)', () => {
    const { unmount } = render(<TetrisSettingsSheet onClose={() => {}} />);
    openGroup('skin');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: '스킨 슬롯' })).toBeTruthy();
    unmount();
    render(<TetrisSettingsSheet onClose={() => {}} initialGroup="skin" />);
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '설정 목록으로' }));
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
  });

  it('설정 버튼 — 열고 닫을 때 알린다(게임은 열 때 멈춘다)', () => {
    const onOpenChange = vi.fn();
    render(<GameSettingsButton onOpenChange={onOpenChange} renderSheet={(close) => <TetrisSettingsSheet onClose={close} />} />);
    fireEvent.click(screen.getByRole('button', { name: /^설정 \(소리/ }));
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('톱니는 소리 버튼 자리를 대신한다 — 꺼져 있으면 음소거 배지·이름에 "소리 꺼짐", 켜면 배지가 사라진다', () => {
    render(<GameSettingsButton renderSheet={(close) => <TetrisSettingsSheet onClose={close} />} />);
    const button = screen.getByRole('button', { name: '설정 (소리 꺼짐)' });
    expect(within(button).getByTestId('settings-sound-off')).toBeTruthy();
    fireEvent.click(button);
    openGroup('sound');
    fireEvent.click(within(screen.getByRole('dialog', { name: '소리' })).getByRole('checkbox', { name: '효과음' }));
    expect(screen.getByRole('button', { name: '설정 (소리 켜짐)' })).toBe(button);
    expect(within(button).queryByTestId('settings-sound-off')).toBeNull();
  });

  it('판 도중(다음 판·대전)의 스킨 상세에는 화면을 떠나는 링크·로그인 버튼이 없다 — 확인 없이 판·경기를 떠나지 않게', () => {
    for (const controls of ['next-game', 'locked'] as const) {
      const { unmount } = render(<TetrisSettingsSheet onClose={() => {}} controls={controls} initialGroup="skin" />);
      expect(screen.queryByRole('link', { name: /전체 스킨 보기/ })).toBeNull();
      expect(screen.queryByRole('button', { name: '카카오로 로그인' })).toBeNull();
      expect(screen.getByText('판이 끝난 뒤 로그인할 수 있어요.')).toBeTruthy();
      unmount();
    }
    render(<TetrisSettingsSheet onClose={() => {}} initialGroup="skin" />);
    expect(screen.getByRole('link', { name: /전체 스킨 보기/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '카카오로 로그인' })).toBeTruthy();
  });

  it('시트가 열린 채 버튼이 사라지면(메뉴가 닫힘) 닫혔다고 알린다 — 게임이 "열림"으로 남지 않게', () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(<GameSettingsButton onOpenChange={onOpenChange} renderSheet={(close) => <TetrisSettingsSheet onClose={close} />} />);
    fireEvent.click(screen.getByRole('button', { name: /^설정 \(소리/ }));
    unmount();
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('마우스·터치로 연 시트도 닫으면 연 버튼으로 포커스 — 클릭 때 포커스를 놓아 useDialog가 돌려줄 곳이 없어도 (통합 검증)', async () => {
    render(<GameSettingsButton renderSheet={(close) => <TetrisSettingsSheet onClose={close} />} />);
    const button = screen.getByRole('button', { name: /^설정 \(소리/ });
    button.focus();
    // 마우스 클릭(detail 1) — 버튼이 스스로 포커스를 놓는다
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
