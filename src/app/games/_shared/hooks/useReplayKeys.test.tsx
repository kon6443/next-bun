// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
import { type ReplayKey, useReplayKeys } from './useReplayKeys';

afterEach(cleanup);

function setup(skip: (e: KeyboardEvent, key: ReplayKey) => boolean = () => false, enabled = true, arrowField: 'code' | 'key' = 'code') {
  const togglePlay = vi.fn();
  const seekBy = vi.fn();
  const hook = renderHook(({ on }) => useReplayKeys(on, { togglePlay, seekBy, skip, arrowField }), { initialProps: { on: enabled } });
  return { togglePlay, seekBy, hook };
}

describe('useReplayKeys', () => {
  it('Space 재생/정지, ←/→ 앞뒤로 — 받은 키는 기본 동작(스크롤)을 막는다', () => {
    const { togglePlay, seekBy } = setup();
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(false);
    expect(togglePlay).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { code: 'ArrowLeft', key: 'ArrowLeft' });
    fireEvent.keyDown(window, { code: 'ArrowRight', key: 'ArrowRight' });
    expect(seekBy.mock.calls).toEqual([[-1], [1]]);
    // 다른 키는 그대로 둔다
    expect(fireEvent.keyDown(window, { code: 'KeyA', key: 'a' })).toBe(true);
  });

  it('skip이 true면 그 키는 재생기가 받지 않는다(기본 동작도 그대로) — 키 종류를 함께 받는다', () => {
    const skip = vi.fn((_e: KeyboardEvent, key: ReplayKey) => key === 'toggle');
    const { togglePlay, seekBy } = setup(skip);
    expect(fireEvent.keyDown(window, { code: 'Space', key: ' ' })).toBe(true);
    expect(togglePlay).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: 'ArrowRight', key: 'ArrowRight' });
    expect(seekBy).toHaveBeenCalledWith(1);
    expect(skip.mock.calls.map(([, key]) => key)).toEqual(['toggle', 'forward']);
  });

  it('꺼져 있으면(재생기 준비 전) 듣지 않는다', () => {
    const { togglePlay, hook } = setup(undefined, false);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(togglePlay).not.toHaveBeenCalled();
    hook.rerender({ on: true });
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(togglePlay).toHaveBeenCalledTimes(1);
  });

  it('최신 핸들러를 쓴다 — 렌더마다 다시 걸지 않아도', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Probe({ toggle }: { toggle: () => void }) {
      useReplayKeys(true, { togglePlay: toggle, seekBy: () => {}, skip: () => false, arrowField: 'code' });
      return null;
    }
    const { rerender } = render(<Probe toggle={first} />);
    rerender(<Probe toggle={second} />);
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('←/→는 게임이 고른 필드로만 알아본다 — NumLock 꺼진 숫자패드 4(code=Numpad4·key=ArrowLeft)는 code 쪽에서 무시', () => {
    const byCode = setup(undefined, true, 'code');
    expect(fireEvent.keyDown(window, { code: 'Numpad4', key: 'ArrowLeft' })).toBe(true);
    expect(byCode.seekBy).not.toHaveBeenCalled();
    cleanup();
    const byKey = setup(undefined, true, 'key');
    expect(fireEvent.keyDown(window, { code: 'Numpad4', key: 'ArrowLeft' })).toBe(false);
    expect(byKey.seekBy).toHaveBeenCalledWith(-1);
  });
});
