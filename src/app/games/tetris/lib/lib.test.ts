import { describe, it, expect } from 'vitest';
import { ACTION } from '../engine';
import { KEY_BINDINGS } from './controls';
import { estimateRank, formatFrames, framesToMs } from './format';
import { normalizePlayerName, validatePlayerName } from './playerName';
import { buildTimeline, collectActions } from './replayTimeline';
import { classifySubmitError } from './submitError';
import { ApiError } from '@/types/api';

describe('이름 규칙 (백엔드와 같은 기준)', () => {
  it('앞뒤 공백 제거·연속 공백 1개', () => {
    expect(normalizePlayerName('  홍  길 동  ')).toBe('홍 길 동');
  });

  it('1~12자, 완성형 한글·영문·숫자·공백·_·-', () => {
    expect(validatePlayerName('테트리스_왕-1')).toBeNull();
    expect(validatePlayerName('a'.repeat(12))).toBeNull();
    expect(validatePlayerName('   ')).not.toBeNull();
    expect(validatePlayerName('a'.repeat(13))).not.toBeNull();
    expect(validatePlayerName('ㅋㅋㅋ')).not.toBeNull();
    expect(validatePlayerName('hi!')).not.toBeNull();
    expect(validatePlayerName('😀')).not.toBeNull();
  });

  it('한글 12자는 36바이트라 통과', () => {
    expect(validatePlayerName('가'.repeat(12))).toBeNull();
  });
});

describe('예상 순위 — 같은 점수면 먼저 낸 기록이 위', () => {
  it('목록 안', () => {
    expect(estimateRank([500, 400, 300], 450, true)).toBe(2);
    expect(estimateRank([500, 400, 300], 400, true)).toBe(3);
    expect(estimateRank([500, 400, 300], 100, true)).toBe(4);
    expect(estimateRank([], 100, true)).toBe(1);
  });

  it('목록이 잘렸고 모두 내 점수 이상이면 알 수 없다(null)', () => {
    expect(estimateRank([500, 400], 300, false)).toBeNull();
    expect(estimateRank([500, 400], 450, false)).toBe(2);
  });
});

describe('시간 표시', () => {
  it('프레임 → m:ss, ms', () => {
    expect(formatFrames(0)).toBe('0:00');
    expect(formatFrames(60 * 75)).toBe('1:15');
    expect(framesToMs(10)).toBe(167);
  });
});

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

describe('등록 실패 분류', () => {
  const api = (code: string, status: number) => new ApiError(code, '서버 메시지', status);

  it('이름 오류는 GAME_PLAYER_NAME_INVALID·FORBIDDEN 두 code만', () => {
    expect(classifySubmitError(api('GAME_PLAYER_NAME_INVALID', 422), false).kind).toBe('name');
    expect(classifySubmitError(api('GAME_PLAYER_NAME_FORBIDDEN', 422), false).kind).toBe('name');
  });

  it('그 밖의 422(VALIDATION_ERROR·GAME_REPLAY_INVALID)·413·409는 final', () => {
    for (const [code, status] of [
      ['VALIDATION_ERROR', 422],
      ['GAME_REPLAY_INVALID', 422],
      ['PAYLOAD_TOO_LARGE', 413],
      ['UNSUPPORTED_MEDIA_TYPE', 415],
      ['GAME_SESSION_INVALID', 409],
    ] as const) {
      expect(classifySubmitError(api(code, status), false).kind).toBe('final');
    }
  });

  it('재시도 중 409는 "이미 등록됐을 수 있다"로 안내', () => {
    expect(classifySubmitError(api('GAME_SESSION_INVALID', 409), true).message).toContain('이미 등록');
  });

  it('네트워크·429·5xx는 retry', () => {
    expect(classifySubmitError(new TypeError('x'), false).kind).toBe('retry');
    expect(classifySubmitError(api('TOO_MANY_REQUESTS', 429), false).kind).toBe('retry');
    expect(classifySubmitError(api('INTERNAL_SERVER_ERROR', 500), false).kind).toBe('retry');
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
