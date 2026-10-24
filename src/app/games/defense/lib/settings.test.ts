// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_EVENT, loadSettings, updateSettings } from './settings';

describe('디펜스 설정 (lib/settings)', () => {
  beforeEach(() => localStorage.clear());

  it('기본값 — 진동·데미지 숫자·흔들림 켜짐·1× (소리는 게임 공통 설정, P8)', () => {
    expect(loadSettings()).toEqual({ v: 1, vibration: true, damageNumbers: true, shake: true, defaultSpeed: 1 });
  });

  it('바꾸면 저장하고 같은 탭에 알린다 · 깨진 필드는 기본값으로 메우고 나머지는 살린다', () => {
    const listener = vi.fn();
    window.addEventListener(SETTINGS_EVENT, listener);
    expect(updateSettings({ vibration: false, defaultSpeed: 3 })).toMatchObject({ vibration: false, defaultSpeed: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadSettings()).toMatchObject({ vibration: false, defaultSpeed: 3 });
    localStorage.setItem('defense:settings', JSON.stringify({ v: 1, sound: true, shake: false, defaultSpeed: 9 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, shake: false });
    localStorage.setItem('defense:settings', JSON.stringify({ v: 2, sound: true }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    window.removeEventListener(SETTINGS_EVENT, listener);
  });
});
