// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { SettingsPanel } from './SettingsPanel';

describe('디펜스 설정 — 공통 설정 시트 (D-001 4단계·D-006)', () => {
  it('소리는 시트 안에 바로 — 대화상자를 겹쳐 열지 않고, Esc 한 번에 닫힌다', () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    render(<SettingsPanel open settings={DEFAULT_SETTINGS} onChange={onChange} onClose={onClose} />);
    const sheet = screen.getByRole('dialog', { name: '설정' });
    expect(sheet.dataset.testid).toBe('defense-settings');
    // 그룹 목록(D-006) — 소리·화면·플레이
    expect(screen.getAllByTestId(/^settings-group-/).map((row) => row.dataset.testid)).toEqual(['settings-group-sound', 'settings-group-display', 'settings-group-play']);
    fireEvent.click(screen.getByTestId('settings-group-sound'));
    const sound = screen.getByTestId('defense-settings-sound');
    // 배경음이 없는 게임 — 효과음 줄만
    expect(within(sound).getByRole('checkbox', { name: '효과음' })).toBeTruthy();
    expect(within(sound).queryByRole('checkbox', { name: '배경음' })).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '설정 목록으로' }));
    fireEvent.click(screen.getByTestId('settings-group-display'));
    fireEvent.click(screen.getByTestId('defense-setting-shake'));
    expect(onChange).toHaveBeenCalledWith({ shake: !DEFAULT_SETTINGS.shake });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('닫혀 있으면 그리지 않는다', () => {
    render(<SettingsPanel open={false} settings={DEFAULT_SETTINGS} onChange={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
