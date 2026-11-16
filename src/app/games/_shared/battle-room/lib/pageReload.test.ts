// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { consumeReloadEntry, resetReloadEntryForTest } from './pageReload';

const navEntry = (type: string, path: string) =>
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type, name: `${window.location.origin}${path}` } as unknown as PerformanceEntry]);

describe('consumeReloadEntry', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetReloadEntryForTest();
  });

  it('지금 주소를 새로고침해 연 문서면 첫 번째만 true — 그 뒤(계속하기·앱 안 이동·다시 자동 입장)는 false', () => {
    navEntry('reload', window.location.pathname);
    expect(consumeReloadEntry()).toBe(true);
    expect(consumeReloadEntry()).toBe(false);
  });

  it('새 탭·링크(navigate)거나 다른 주소를 새로고침한 문서면 false', () => {
    navEntry('navigate', window.location.pathname);
    expect(consumeReloadEntry()).toBe(false);
    resetReloadEntryForTest();
    navEntry('reload', '/games/tetris/battle');
    expect(consumeReloadEntry()).toBe(window.location.pathname === '/games/tetris/battle');
  });
});
