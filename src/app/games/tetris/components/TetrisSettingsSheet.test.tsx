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

describe('테트리스 설정 시트 (D-001)', () => {
  it('소리·조작·연출·스킨을 한 시트에 — 조작을 바꾸면 같은 스토어에 저장', () => {
    render(<TetrisSettingsSheet onClose={() => {}} />);
    const sheet = screen.getByRole('dialog', { name: '설정' });
    for (const name of ['소리', '조작', '연출', '스킨']) expect(within(sheet).getByRole('heading', { name })).toBeTruthy();
    fireEvent.change(within(sheet).getByRole('slider', { name: /DAS/ }), { target: { value: '15' } });
    expect(tetrisSettingsStore.get().das).toBe(15);
    expect(within(sheet).queryByText('DAS·ARR은 다음 판부터 적용돼요.')).toBeNull();
  });

  it('싱글 플레이 중 — 바꿀 수 있고 "다음 판부터"를 알린다', () => {
    render(<TetrisSettingsSheet onClose={() => {}} controls="next-game" />);
    expect(screen.getByText('DAS·ARR은 다음 판부터 적용돼요.')).toBeTruthy();
    expect(screen.getByRole('slider', { name: /ARR/ })).toBeTruthy();
  });

  it('대전 중 — DAS·ARR은 읽기만(막대 없음), 진동은 바꿀 수 있다', () => {
    tetrisSettingsStore.save({ das: 15, arr: 0 });
    render(<TetrisSettingsSheet onClose={() => {}} controls="locked" />);
    expect(screen.queryByRole('slider', { name: /DAS|ARR/ })).toBeNull();
    expect(screen.getByText('250ms')).toBeTruthy();
    expect(screen.getByText('즉시')).toBeTruthy();
    expect(screen.getByText(/대전 중에는 바꿀 수 없어요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /진동/ }));
    expect(tetrisSettingsStore.get().vibration).toBe(false);
  });

  it('스킨은 시트 안 두 번째 화면 — 모달을 겹치지 않고, ←로 돌아오면 스킨 줄로 포커스', async () => {
    render(<TetrisSettingsSheet onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('skin-settings-entry'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const back = screen.getByRole('button', { name: '설정 목록으로' });
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    expect(document.activeElement).toBe(back);
    expect(screen.getByRole('tablist', { name: '스킨 슬롯' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(back);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(screen.getByRole('dialog', { name: '설정' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('skin-settings-entry'));
  });

  it('설정 버튼 — 열고 닫을 때 알린다(게임은 열 때 멈춘다), 톱니는 "설정"으로 읽힌다', () => {
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
    fireEvent.click(within(screen.getByRole('dialog', { name: '설정' })).getByRole('checkbox', { name: '효과음' }));
    expect(screen.getByRole('button', { name: '설정 (소리 켜짐)' })).toBe(button);
    expect(within(button).queryByTestId('settings-sound-off')).toBeNull();
  });
});
