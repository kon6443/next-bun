// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_EVENT, loadSettings, updateSettings } from './settings';

describe('디펜스 설정 (lib/settings)', () => {
  beforeEach(() => localStorage.clear());

  it('기본값 — 효과음 꺼짐(사용자 결정)·진동·데미지 숫자·흔들림 켜짐·1×', () => {
    expect(loadSettings()).toEqual({ v: 1, sound: false, vibration: true, damageNumbers: true, shake: true, defaultSpeed: 1 });
  });

  it('바꾸면 저장하고 같은 탭에 알린다 · 깨진 필드는 기본값으로 메우고 나머지는 살린다', () => {
    const listener = vi.fn();
    window.addEventListener(SETTINGS_EVENT, listener);
    expect(updateSettings({ sound: true, defaultSpeed: 3 })).toMatchObject({ sound: true, defaultSpeed: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadSettings()).toMatchObject({ sound: true, defaultSpeed: 3 });
    localStorage.setItem('defense:settings', JSON.stringify({ v: 1, sound: 'yes', shake: false, defaultSpeed: 9 }));
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, shake: false });
    localStorage.setItem('defense:settings', JSON.stringify({ v: 2, sound: true }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    window.removeEventListener(SETTINGS_EVENT, listener);
  });
});
