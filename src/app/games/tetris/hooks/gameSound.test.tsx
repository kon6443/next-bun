// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { ACTION } from '../engine';
import type { SoundCue } from '../lib/effects';

// 게임 루프 → 소리 플레이어 연결만 본다 (합성·기본 꺼짐은 lib/sound 테스트)
const player = { playCues: vi.fn<(cues: readonly SoundCue[]) => void>(), play: vi.fn(), setMusicPlaying: vi.fn<(on: boolean) => void>() };
vi.mock('../lib/sound/soundPlayer', () => ({ getSoundPlayer: () => player }));

import { useTetrisPlay } from './useTetrisPlay';
import { useBattlePlay } from '../battle-ui/hooks/useBattlePlay';

const kinds = () => player.playCues.mock.calls.flatMap(([cues]) => cues.map((c) => c.kind));

describe('게임 소리 연결 (DESIGN §20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] });
    player.playCues.mockClear();
    player.play.mockClear();
    player.setMusicPlaying.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('싱글: 이동·회전·하드 드롭 신호가 프레임마다 플레이어로 간다, 배경음악은 진행 중에만', () => {
    const { result, unmount } = renderHook(() => useTetrisPlay({ vibration: false, onGameOver: () => {} }));
    act(() => result.current.start(7, 10, 2));
    expect(player.setMusicPlaying).toHaveBeenLastCalledWith(true);
    act(() => {
      vi.advanceTimersByTime(50);
      result.current.instant(ACTION.ROTATE_CW);
      vi.advanceTimersByTime(17);
      result.current.press(ACTION.LEFT_PRESS, ACTION.LEFT_RELEASE);
      vi.advanceTimersByTime(17);
      result.current.release(ACTION.LEFT_PRESS);
      vi.advanceTimersByTime(17);
      result.current.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(17);
    });
    expect(kinds()).toEqual(expect.arrayContaining(['rotate', 'move', 'hardDrop']));
    act(() => result.current.pause());
    expect(player.setMusicPlaying).toHaveBeenLastCalledWith(false);
    unmount();
    expect(player.setMusicPlaying).toHaveBeenLastCalledWith(false);
  });

  it('대전: 받은 가비지가 판에 들어오면 경고음(garbage) 신호, 게임이 끝나면 gameOver', () => {
    const { result } = renderHook(() => useBattlePlay({}));
    act(() => result.current.start(424242, 8, 1));
    let id = 1;
    for (let i = 0; i < 6000 && result.current.status !== 'over'; i++) {
      act(() => {
        if (i % 40 === 0) result.current.receive({ id: id++, lines: 3, hole: i % 10 });
        if (i % 9 === 0) result.current.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(17);
      });
    }
    expect(result.current.status).toBe('over');
    const all = player.playCues.mock.calls.flatMap(([cues]) => cues);
    expect(all.some((c) => c.kind === 'garbage' && (c.value ?? 0) > 0)).toBe(true);
    expect(all.filter((c) => c.kind === 'gameOver')).toHaveLength(1);
    expect(player.setMusicPlaying).toHaveBeenLastCalledWith(false);
  });
});
