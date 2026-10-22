// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SOUND_SETTINGS,
  SOUND_SETTINGS_KEY,
  __resetSoundSettingsForTests,
  getSoundSettings,
  loadSoundSettings,
  saveSoundSettings,
  subscribeSoundSettings,
} from './soundSettings';

describe('soundSettings', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetSoundSettingsForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it('저장값이 없으면 기본 꺼짐이다', () => {
    expect(DEFAULT_SOUND_SETTINGS).toEqual({ sfx: false, music: false, volume: 0.6 });
    expect(loadSoundSettings()).toEqual({ sfx: false, music: false, volume: 0.6 });
  });

  it('일부만 저장해도 나머지는 유지되고 다시 읽으면 복원된다', () => {
    saveSoundSettings({ sfx: true });
    saveSoundSettings({ volume: 0.3 });
    expect(JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY)!)).toEqual({ sfx: true, music: false, volume: 0.3 });
    __resetSoundSettingsForTests();
    expect(getSoundSettings()).toEqual({ sfx: true, music: false, volume: 0.3 });
  });

  it('잘못된 JSON·타입은 기본값, 범위 밖 볼륨은 0~1로 자른다', () => {
    window.localStorage.setItem(SOUND_SETTINGS_KEY, '{not json');
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ sfx: 'yes', music: 1, volume: 5 }));
    expect(loadSoundSettings()).toEqual({ sfx: false, music: false, volume: 1 });
    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ volume: -2 }));
    expect(loadSoundSettings().volume).toBe(0);
    window.localStorage.setItem(SOUND_SETTINGS_KEY, 'null');
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(saveSoundSettings({ volume: Number.NaN }).volume).toBe(0.6);
  });

  it('저장소가 막혀 있어도 기본값으로 읽고, 바꾼 값은 이번 방문 동안 유지된다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(() => saveSoundSettings({ sfx: true })).not.toThrow();
    const unsubscribe = subscribeSoundSettings(() => {});
    expect(getSoundSettings().sfx).toBe(true);
    unsubscribe();
  });

  it('구독자에게 바로 알리고, 다른 탭의 저장(storage 이벤트)도 반영한다', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSoundSettings(listener);
    saveSoundSettings({ music: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSoundSettings().music).toBe(true);

    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ sfx: false, music: false, volume: 0.2 }));
    window.dispatchEvent(new StorageEvent('storage', { key: SOUND_SETTINGS_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSoundSettings()).toEqual({ sfx: false, music: false, volume: 0.2 });
    unsubscribe();
  });
});
