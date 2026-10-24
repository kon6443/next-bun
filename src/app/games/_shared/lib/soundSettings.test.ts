// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SOUND_SETTINGS,
  LEGACY_DEFENSE_SETTINGS_KEY,
  LEGACY_TETRIS_SOUND_KEY,
  SOUND_SETTINGS_KEY,
  __resetSoundSettingsForTests,
  getSoundSettings,
  loadSoundSettings,
  saveSoundSettings,
  subscribeSoundSettings,
} from './soundSettings';

const OFF = { sfx: false, sfxVolume: 0.6, music: false, musicVolume: 0.6 };

describe('게임 공통 소리 설정 (games-polish P8)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetSoundSettingsForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it('저장값이 없으면 효과음·배경음 모두 꺼짐', () => {
    expect(DEFAULT_SOUND_SETTINGS).toEqual(OFF);
    expect(loadSoundSettings()).toEqual(OFF);
  });

  it('일부만 저장해도 나머지는 유지되고 다시 읽으면 복원된다', () => {
    saveSoundSettings({ sfx: true });
    saveSoundSettings({ musicVolume: 0.3 });
    expect(JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY)!)).toEqual({ ...OFF, sfx: true, musicVolume: 0.3 });
    __resetSoundSettingsForTests();
    expect(getSoundSettings()).toEqual({ ...OFF, sfx: true, musicVolume: 0.3 });
  });

  it('잘못된 JSON·타입은 기본값, 범위 밖 음량은 0~1로 자른다', () => {
    window.localStorage.setItem(SOUND_SETTINGS_KEY, '{not json');
    expect(loadSoundSettings()).toEqual(OFF);
    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ sfx: 'yes', music: 1, sfxVolume: 5, musicVolume: -2 }));
    expect(loadSoundSettings()).toEqual({ ...OFF, sfxVolume: 1, musicVolume: 0 });
    window.localStorage.setItem(SOUND_SETTINGS_KEY, 'null');
    expect(loadSoundSettings()).toEqual(OFF);
    expect(saveSoundSettings({ sfxVolume: Number.NaN }).sfxVolume).toBe(0.6);
  });

  it('예전 게임별 저장값을 한 번 옮긴다 — 직접 켠 것만 켜고, 공통 키가 생기면 다시 옮기지 않는다', () => {
    window.localStorage.setItem(LEGACY_TETRIS_SOUND_KEY, JSON.stringify({ sfx: false, music: true, volume: 0.3 }));
    window.localStorage.setItem(LEGACY_DEFENSE_SETTINGS_KEY, JSON.stringify({ v: 1, sound: true, vibration: true }));
    expect(loadSoundSettings()).toEqual({ sfx: true, sfxVolume: 0.3, music: true, musicVolume: 0.3 });
    expect(JSON.parse(window.localStorage.getItem(SOUND_SETTINGS_KEY)!)).toEqual({ sfx: true, sfxVolume: 0.3, music: true, musicVolume: 0.3 });
    window.localStorage.setItem(LEGACY_DEFENSE_SETTINGS_KEY, JSON.stringify({ v: 1, sound: false }));
    window.localStorage.setItem(LEGACY_TETRIS_SOUND_KEY, JSON.stringify({ sfx: true, music: true, volume: 1 }));
    saveSoundSettings({ sfx: false, music: false });
    __resetSoundSettingsForTests();
    expect(getSoundSettings()).toEqual({ sfx: false, sfxVolume: 0.3, music: false, musicVolume: 0.3 });
  });

  it('예전 저장값이 꺼짐·없음이면 그대로 꺼짐(기본 OFF 유지)', () => {
    window.localStorage.setItem(LEGACY_DEFENSE_SETTINGS_KEY, JSON.stringify({ v: 1, sound: false }));
    expect(loadSoundSettings()).toEqual(OFF);
    window.localStorage.clear();
    window.localStorage.setItem(LEGACY_DEFENSE_SETTINGS_KEY, JSON.stringify({ v: 1, vibration: false }));
    expect(loadSoundSettings()).toEqual(OFF);
    expect(window.localStorage.getItem(SOUND_SETTINGS_KEY)).toBeNull();
  });

  it('저장소가 막혀 있어도 기본값으로 읽고, 바꾼 값은 이번 방문 동안 유지된다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSoundSettings()).toEqual(OFF);
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

    window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify({ ...OFF, sfxVolume: 0.2 }));
    window.dispatchEvent(new StorageEvent('storage', { key: SOUND_SETTINGS_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSoundSettings()).toEqual({ ...OFF, sfxVolume: 0.2 });
    unsubscribe();
  });
});
