// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLocalSettingsStore } from './settingsStore';

type S = { volume: number; on: boolean };
const DEFAULTS: S = { volume: 5, on: true };
const normalize = (raw: unknown): S => {
  const v = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    volume: typeof v.volume === 'number' && Number.isInteger(v.volume) ? Math.min(10, Math.max(0, v.volume)) : DEFAULTS.volume,
    on: typeof v.on === 'boolean' ? v.on : DEFAULTS.on,
  };
};
const store = () => createLocalSettingsStore<S>({ key: 'test:settings', defaults: DEFAULTS, normalize });

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('localStorage 설정 구독 스토어', () => {
  it('저장된 값이 없으면 기본값, 깨진 값·범위 밖은 바로잡는다', () => {
    expect(store().get()).toEqual(DEFAULTS);
    window.localStorage.setItem('test:settings', '{not json');
    expect(store().get()).toEqual(DEFAULTS);
    window.localStorage.setItem('test:settings', JSON.stringify({ volume: 99, on: 'x' }));
    expect(store().get()).toEqual({ volume: 10, on: true });
  });

  it('같은 값이면 같은 객체 — useSyncExternalStore가 매 렌더 다시 그리지 않게', () => {
    const s = store();
    expect(s.get()).toBe(s.get());
  });

  it('일부만 바꿔 같은 키에 저장하고, 같은 호출 안에서 구독자에게 알린다', () => {
    const s = store();
    const listener = vi.fn();
    s.subscribe(listener);
    const next = s.save({ volume: 3 });
    expect(next).toEqual({ volume: 3, on: true });
    expect(JSON.parse(window.localStorage.getItem('test:settings')!)).toEqual({ volume: 3, on: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(s.get()).toBe(next);
  });

  it('다른 탭의 저장(storage 이벤트)을 받아 다시 읽는다', () => {
    const s = store();
    const listener = vi.fn();
    s.subscribe(listener);
    s.get();
    window.localStorage.setItem('test:settings', JSON.stringify({ volume: 1, on: false }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'test:settings' }));
    expect(listener).toHaveBeenCalled();
    expect(s.get()).toEqual({ volume: 1, on: false });
  });

  it('저장이 막혀도 이번 방문 동안은 바꾼 값 — 다시 구독해도 잃지 않는다', () => {
    const s = store();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    s.save({ on: false });
    const off = s.subscribe(() => {});
    off();
    s.subscribe(() => {});
    expect(s.get().on).toBe(false);
  });

  it('구독 없이 읽으면(load) 저장소를 다시 읽는다 — 구독 중에는 캐시(같은 객체)', () => {
    const s = store();
    expect(s.load()).toEqual(DEFAULTS);
    window.localStorage.setItem('test:settings', JSON.stringify({ volume: 2, on: true }));
    expect(s.load()).toEqual({ volume: 2, on: true });
    s.subscribe(() => {});
    expect(s.load()).toBe(s.get());
  });

  it('서버 렌더 값은 기본값', () => {
    expect(store().getServerSnapshot()).toEqual(DEFAULTS);
  });
});
