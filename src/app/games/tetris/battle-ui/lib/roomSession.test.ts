// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { clearRoomSession, loadRoomSession, resetRoomSessionForTest, ROOM_SESSION_TTL_MS, saveRoomSession } from './roomSession';

const session = (playerToken = 't1') => ({ playerId: 'p1', playerToken, playerName: '나' });
const NOW = 1_800_000_000_000;

describe('roomSession (localStorage, D-003)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    resetRoomSessionForTest();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('저장한 값을 같은 브라우저에서 읽는다 — 새 탭도 같은 저장소', () => {
    saveRoomSession('ABC234', session(), NOW);
    expect(loadRoomSession('ABC234', NOW + 1000)).toEqual(session());
    expect(JSON.parse(window.localStorage.getItem('tetris:battle:ABC234') ?? '{}').savedAt).toBe(NOW);
  });

  it('하루가 지나면 버리고 지운다', () => {
    saveRoomSession('ABC234', session(), NOW);
    expect(loadRoomSession('ABC234', NOW + ROOM_SESSION_TTL_MS + 1)).toBeNull();
    expect(window.localStorage.getItem('tetris:battle:ABC234')).toBeNull();
  });

  it('저장할 때 오래된·깨진 다른 방 키를 정리한다 (다른 키는 건드리지 않는다)', () => {
    saveRoomSession('OLD222', session(), NOW - ROOM_SESSION_TTL_MS - 1);
    window.localStorage.setItem('tetris:battle:BAD333', '{not json');
    window.localStorage.setItem('other:key', 'keep');
    saveRoomSession('NEW444', session(), NOW);
    expect(window.localStorage.getItem('tetris:battle:OLD222')).toBeNull();
    expect(window.localStorage.getItem('tetris:battle:BAD333')).toBeNull();
    expect(window.localStorage.getItem('other:key')).toBe('keep');
    expect(loadRoomSession('NEW444', NOW)).toEqual(session());
  });

  it('지우기는 같은 토큰일 때만 — 다른 탭이 새로 저장한 토큰은 남긴다', () => {
    saveRoomSession('ABC234', session('theirs'), NOW);
    clearRoomSession('ABC234', 'mine');
    expect(loadRoomSession('ABC234', NOW)?.playerToken).toBe('theirs');
    clearRoomSession('ABC234', 'theirs');
    expect(loadRoomSession('ABC234', NOW)).toBeNull();
  });

  it('이전 배포의 sessionStorage 값은 처음 읽을 때 한 번만 옮긴다 — 다른 탭이 나중에 지운 값을 되살리지 않는다', () => {
    window.sessionStorage.setItem('tetris:battle:ABC234', JSON.stringify(session('legacy')));
    window.sessionStorage.setItem('tetris:battle:DEF567', JSON.stringify(session('legacy2')));
    // 다른 탭이 이미 옮긴 방은 그 값을 둔다
    saveRoomSession('DEF567', session('moved'), NOW);
    expect(loadRoomSession('ABC234', NOW)?.playerToken).toBe('legacy');
    expect(loadRoomSession('DEF567', NOW)?.playerToken).toBe('moved');
    expect(window.sessionStorage.length).toBe(0);
    // 다른 탭이 지웠다 → 이 탭이 다시 읽어도 없다
    clearRoomSession('ABC234', 'legacy');
    window.sessionStorage.setItem('tetris:battle:ABC234', JSON.stringify(session('late')));
    expect(loadRoomSession('ABC234', NOW)).toBeNull();
  });

  it('마지막으로 들어간 탭(tabId)을 함께 읽는다', () => {
    saveRoomSession('ABC234', { ...session(), tabId: 'tab-1' }, NOW);
    expect(loadRoomSession('ABC234', NOW)?.tabId).toBe('tab-1');
  });

  it('저장소에 쓰지 못한 새 값은 저장소에 남은 예전 값보다 우선한다', () => {
    saveRoomSession('ABC234', session('old'), NOW);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    saveRoomSession('ABC234', session('new'), NOW + 1000);
    spy.mockRestore();
    expect(loadRoomSession('ABC234', NOW + 2000)?.playerToken).toBe('new');
  });

  it('localStorage를 못 쓰는 환경이면 이전 값을 이 탭 메모리로 옮긴다', () => {
    window.sessionStorage.setItem('tetris:battle:ABC234', JSON.stringify(session('legacy')));
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (this === window.localStorage) throw new DOMException('denied', 'SecurityError');
      return getItem.call(this, key);
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage) {
      if (this === window.localStorage) throw new DOMException('denied', 'SecurityError');
    });
    expect(loadRoomSession('ABC234', NOW)?.playerToken).toBe('legacy');
  });

  it('저장소에 쓰지 못하면 이 탭 메모리 값으로 재연결한다 (FE-14)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    saveRoomSession('MEM555', session('memory'), NOW);
    expect(loadRoomSession('MEM555', NOW)?.playerToken).toBe('memory');
    clearRoomSession('MEM555', 'memory');
    expect(loadRoomSession('MEM555', NOW)).toBeNull();
  });
});
