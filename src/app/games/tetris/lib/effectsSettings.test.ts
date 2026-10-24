// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { getReducedEffectsPref, saveReducedEffectsPref, subscribeReducedEffects } from './effectsSettings';

describe('연출 줄이기 설정 — 다른 탭 변경 (games-polish FE-20)', () => {
  it('다른 탭이 저장소를 통째로 비우면(clear, key null) 따라가 기본값으로 — 소리 설정과 같은 기준', () => {
    saveReducedEffectsPref('on');
    expect(getReducedEffectsPref()).toBe('on');
    const listener = vi.fn();
    const unsubscribe = subscribeReducedEffects(listener);
    window.localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getReducedEffectsPref()).toBe('auto');
    unsubscribe();
  });
});
