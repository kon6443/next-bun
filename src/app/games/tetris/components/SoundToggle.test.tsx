// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { __resetSoundPlayerForTests } from '../lib/sound/soundPlayer';
import { SOUND_SETTINGS_KEY, __resetSoundSettingsForTests } from '../lib/sound/soundSettings';
import { SoundSettingsPanel } from './SoundSettingsPanel';
import { SoundToggle } from './SoundToggle';

const stored = () => JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY) ?? 'null');

describe('소리 UI', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetSoundSettingsForTests();
  });
  afterEach(() => __resetSoundPlayerForTests());

  it('SoundToggle — 기본은 꺼짐이고 누르면 sfx:true로 저장된다', () => {
    render(<SoundToggle />);
    const button = screen.getByRole('button', { name: '소리 켜기' });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(button);
    expect(stored()).toMatchObject({ sfx: true });
    const on = screen.getByRole('button', { name: '소리 끄기' });
    expect(on).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(on);
    expect(stored()).toMatchObject({ sfx: false });
  });

  it('SoundToggle — 배경음악만 켜져 있어도 켜짐으로 보이고, 누르면 둘 다 끈다 (빠른 음소거)', () => {
    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ sfx: false, music: true, volume: 0.6 }));
    __resetSoundSettingsForTests();
    render(<SoundToggle />);
    fireEvent.click(screen.getByRole('button', { name: '소리 끄기' }));
    expect(stored()).toMatchObject({ sfx: false, music: false });
    expect(screen.getByRole('button', { name: '소리 켜기' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('SoundSettingsPanel — 토글과 볼륨 슬라이더가 저장값을 바꾸고 다른 화면에도 바로 반영된다', () => {
    render(
      <>
        <SoundToggle />
        <SoundSettingsPanel />
      </>,
    );
    const sfx = screen.getByRole('checkbox', { name: '효과음' });
    const music = screen.getByRole('checkbox', { name: '배경음악' });
    expect(sfx).not.toBeChecked();
    expect(music).not.toBeChecked();
    expect(screen.getByText(/기본으로 꺼져/)).toBeInTheDocument();

    fireEvent.click(sfx);
    expect(stored()).toMatchObject({ sfx: true, music: false });
    expect(screen.getByRole('button', { name: '소리 끄기' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(music);
    expect(stored()).toMatchObject({ music: true });

    const volume = screen.getByRole('slider', { name: '볼륨' });
    expect(volume).toHaveValue('60');
    fireEvent.change(volume, { target: { value: '25' } });
    fireEvent.pointerUp(volume);
    expect(stored()).toMatchObject({ volume: 0.25 });
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});
