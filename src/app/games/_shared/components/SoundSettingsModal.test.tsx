// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SOUND_SETTINGS_KEY, __resetSoundSettingsForTests, getSoundSettings } from '../lib/soundSettings';
import { registerSoundUnlock } from '../lib/soundUnlock';
import { SoundButton } from './SoundButton';
import { SoundSettingsEntry } from './SoundSettingsEntry';

describe('공통 소리 버튼·모달 (games-polish P8)', () => {
  let unregister: (() => void) | null = null;
  beforeEach(() => {
    window.localStorage.clear();
    __resetSoundSettingsForTests();
  });
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it('버튼은 꺼짐으로 시작하고 누르면 모달 — 첫 컨트롤에 포커스, Esc로 닫고 버튼으로 포커스를 돌려준다', () => {
    const onOpenChange = vi.fn();
    render(<SoundButton onOpenChange={onOpenChange} />);
    const button = screen.getByRole('button', { name: '소리 설정 (꺼짐)' });
    button.focus();
    fireEvent.click(button, { detail: 0 });
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const dialog = screen.getByRole('dialog', { name: '소리 설정' });
    expect(within(dialog).getByRole('button', { name: '닫기' })).toHaveFocus();
    expect(within(dialog).getByRole('checkbox', { name: '효과음' })).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: '배경음' })).not.toBeChecked();
    // 꺼져 있으면 음량은 잠근다
    expect(within(dialog).getByRole('slider', { name: '효과음 음량' })).toBeDisabled();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(button).toHaveFocus();
  });

  it('켜는 클릭 핸들러 안에서(같은 호출 스택) 저장된 뒤 플레이어를 깨운다 — Safari 제스처 조건', () => {
    const seen: boolean[] = [];
    unregister = registerSoundUnlock(() => seen.push(getSoundSettings().sfx));
    render(<SoundButton />);
    fireEvent.click(screen.getByRole('button', { name: /소리 설정/ }));
    expect(seen).toEqual([]); // 꺼진 채 열기만 하면 깨우지 않는다
    let duringClick: boolean[] | null = null;
    const checkbox = screen.getByRole('checkbox', { name: '효과음' });
    checkbox.addEventListener('click', () => {
      duringClick = [...seen];
    });
    fireEvent.click(checkbox);
    // React onChange가 먼저(같은 click 디스패치 안) — 그 사이에 이미 저장된 값(true)으로 깨웠다
    expect(seen).toEqual([true]);
    expect(duringClick === null || (duringClick as boolean[]).length <= 1).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY)!)).toMatchObject({ sfx: true });
    expect(screen.getByRole('button', { name: '소리 설정 (켜짐)' })).toBeInTheDocument();
  });

  it('바꾸면 바로 저장 — 음량·배경음, 끄면 깨우지 않는다', () => {
    const unlock = vi.fn();
    unregister = registerSoundUnlock(unlock);
    render(<SoundButton />);
    fireEvent.click(screen.getByRole('button', { name: /소리 설정/ }));
    const dialog = screen.getByRole('dialog', { name: '소리 설정' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '배경음' }));
    fireEvent.change(within(dialog).getByRole('slider', { name: '배경음 음량' }), { target: { value: '25' } });
    expect(getSoundSettings()).toMatchObject({ music: true, musicVolume: 0.25, sfx: false });
    expect(unlock).toHaveBeenCalledTimes(2);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '배경음' }));
    expect(unlock).toHaveBeenCalledTimes(2);
  });

  it('설정 화면 줄 — 지금 상태를 보이고, 배경음이 없는 게임은 효과음만', () => {
    render(<SoundSettingsEntry music={false} />);
    const entry = screen.getByRole('button', { name: /소리 설정/ });
    expect(entry).toHaveTextContent('효과음 꺼짐');
    expect(entry).not.toHaveTextContent('배경음');
    fireEvent.click(entry);
    const dialog = screen.getByRole('dialog', { name: '소리 설정' });
    expect(within(dialog).queryByRole('checkbox', { name: '배경음' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: '효과음' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('button', { name: /소리 설정/ })).toHaveTextContent('효과음 켜짐');
  });
});
