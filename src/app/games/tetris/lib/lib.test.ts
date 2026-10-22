import { describe, it, expect } from 'vitest';
import { ACTION } from '../engine';
import { KEY_BINDINGS } from './controls';
import { buildTimeline, collectActions } from './replayTimeline';

describe('리플레이 타임라인', () => {
  it('delta를 절대 프레임으로 풀고, 같은 프레임 동작을 순서대로 모은다', () => {
    const timeline = buildTimeline([0, ACTION.LEFT_PRESS, 0, ACTION.ROTATE_CW, 5, ACTION.LEFT_RELEASE]);
    expect(Array.from(timeline.frames)).toEqual([0, 0, 5]);
    const out: number[] = [];
    let cursor = collectActions(timeline, 0, 0, out);
    expect(out).toEqual([ACTION.LEFT_PRESS, ACTION.ROTATE_CW]);
    cursor = collectActions(timeline, cursor, 1, out);
    expect(out).toEqual([]);
    cursor = collectActions(timeline, cursor, 5, out);
    expect(out).toEqual([ACTION.LEFT_RELEASE]);
    expect(cursor).toBe(3);
  });
});

describe('키 매핑', () => {
  it('DESIGN §6 키가 모두 있다', () => {
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space', 'ArrowUp', 'KeyX', 'KeyZ', 'ControlLeft', 'KeyC', 'ShiftLeft', 'Escape', 'KeyP']) {
      expect(KEY_BINDINGS[code]).toBeDefined();
    }
    expect(KEY_BINDINGS.ArrowLeft).toEqual({ kind: 'hold', press: ACTION.LEFT_PRESS, release: ACTION.LEFT_RELEASE });
  });
});
