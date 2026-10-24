// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RoomState, TetrisBattleSocket } from '@/types/tetrisBattleSocket';
import { BOARD_BASE64_LENGTH } from '@/types/tetrisBattleSocket';
import { ACTION, BOARD_ROWS, BOARD_WIDTH } from '../../engine';
import { type BattleReplayInput, simulateBattleReplay } from '../../battle-engine';
import type { MatchSync } from '../contexts/BattleSocketContext';
import { encodeBoard } from '../lib/boardCodec';
import { RESULT_WAIT_MS, UNAVAILABLE_GRACE_MS, useBattleMatch } from './useBattleMatch';

type Listener = (...args: unknown[]) => void;

/** 가짜 소켓 — 서버 이벤트는 fire, 보낸 요청은 emitted, ack 응답은 ack로 정한다 */
class FakeSocket {
  connected = true;
  listeners = new Map<string, Set<Listener>>();
  emitted: { event: string; payload: Record<string, unknown> }[] = [];
  ack: (event: string) => unknown = () => ({ ok: true, data: {} });
  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(fn);
    return this;
  }
  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
    return this;
  }
  timeout() {
    return this;
  }
  emit(event: string, payload: Record<string, unknown>, callback?: (err: Error | null, response: unknown) => void) {
    this.emitted.push({ event, payload });
    callback?.(null, this.ack(event));
  }
  fire(event: string, payload: unknown) {
    for (const fn of this.listeners.get(event) ?? []) fn(payload);
  }
}

const room = (status: RoomState['status'] = 'WAITING'): RoomState => ({
  code: 'ABC234',
  name: '방',
  maxPlayers: 3,
  locked: false,
  hostId: 'p1',
  status,
  players: [],
});

const PLAYERS = [
  { playerId: 'p1', name: '나' },
  { playerId: 'p2', name: '친구' },
  { playerId: 'p3', name: '셋째' },
];

describe('useBattleMatch', () => {
  let socket: FakeSocket;
  let sync: MatchSync | null;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date', 'setTimeout', 'clearTimeout'] });
    socket = new FakeSocket();
    sync = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (
    status: RoomState['status'] = 'WAITING',
    submitReplay?: (matchId: string, replay: BattleReplayInput) => Promise<'saved' | 'invalid' | 'expired' | 'failed'>,
    recoverSeat?: () => void,
  ) => {
    const onAttack = vi.fn();
    const hook = renderHook(
      ({ r }: { r: RoomState }) =>
        useBattleMatch({
          socket: socket as unknown as TetrisBattleSocket,
          room: r,
          myPlayerId: 'p1',
          das: 10,
          arr: 2,
          registerMatchSync: (s) => {
            sync = s;
            return () => {
              if (sync === s) sync = null;
            };
          },
          recoverSeat,
          onAttack,
          submitReplay,
        }),
      { initialProps: { r: room(status) } },
    );
    return { ...hook, onAttack };
  };

  const startMatch = (result: ReturnType<typeof setup>['result'], matchId = 'm1') => {
    act(() => socket.fire('matchStarting', { matchId, seed: 7, startInMs: 3000, startAt: '', players: PLAYERS }));
    expect(result.current.phase.kind).toBe('countdown');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.phase).toEqual({ kind: 'playing', matchId });
  };

  it('matchStarting → 카운트다운(startInMs) 뒤 시작, 상대는 나를 뺀 참가자', () => {
    const { result } = setup();
    startMatch(result);
    expect(result.current.opponents.map((o) => o.playerId)).toEqual(['p2', 'p3']);
    expect(result.current.play.status).toBe('playing');
  });

  it('블록 고정마다 lock(seq·frame·판 268자·pending)을 보내고 ack의 targetId를 대상으로 쓴다', () => {
    const { result } = setup();
    startMatch(result);
    socket.ack = (event) => (event === 'lock' ? { ok: true, data: { targetId: 'p3' } } : { ok: true, data: {} });
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(50);
    });
    const lock = socket.emitted.find((e) => e.event === 'lock')?.payload;
    expect(lock).toMatchObject({ matchId: 'm1', seq: 1, sent: 0, lines: 0, pc: false, pending: 0, tSpin: 'none' });
    expect(typeof lock?.frame).toBe('number');
    expect(String(lock?.board)).toHaveLength(BOARD_BASE64_LENGTH);
    expect(result.current.targetId).toBe('p3');
  });

  it('가비지: 같은 id는 한 번만, 다른 매치 것은 무시 — 공격 이벤트는 궤적으로', () => {
    const { result, onAttack } = setup();
    startMatch(result);
    act(() => {
      socket.fire('garbage', { matchId: 'm1', id: 1, lines: 2, hole: 3, from: 'p2' });
      socket.fire('garbage', { matchId: 'm1', id: 1, lines: 2, hole: 3, from: 'p2' });
      socket.fire('garbage', { matchId: 'old', id: 2, lines: 4, hole: 0, from: 'p2' });
      socket.fire('attack', { matchId: 'm1', from: 'p2', to: 'p1', lines: 2 });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.play.battleRef.current?.received.map((g) => g.id)).toEqual([1]);
    expect(onAttack).toHaveBeenCalledWith('p2', 'p1', 2);
  });

  it('opponentUpdate는 미니보드 판·대기 줄, playerKO는 순위·KO 수 — 내가 KO되면 판을 멈춘다', () => {
    const { result } = setup();
    startMatch(result);
    const board = new Uint8Array(BOARD_ROWS * BOARD_WIDTH);
    board[39 * BOARD_WIDTH] = 8;
    act(() => socket.fire('opponentUpdate', { matchId: 'm1', playerId: 'p2', board: encodeBoard(board), pending: 3, combo: 0, b2b: false }));
    const p2 = result.current.opponents.find((o) => o.playerId === 'p2');
    expect(p2?.pending).toBe(3);
    expect(p2?.cells?.[190]).toBe(8);

    act(() => socket.fire('playerKO', { matchId: 'm1', playerId: 'p3', by: 'p1', place: 3, reason: 'topout' }));
    expect(result.current.opponents.find((o) => o.playerId === 'p3')?.place).toBe(3);
    expect(result.current.myKos).toBe(1);

    act(() => socket.fire('playerKO', { matchId: 'm1', playerId: 'p1', by: 'p2', place: 2, reason: 'disconnect' }));
    expect(result.current.phase).toEqual({ kind: 'out', matchId: 'm1', place: 2 });
    expect(result.current.play.status).toBe('over');
    expect(result.current.opponents.find((o) => o.playerId === 'p2')?.kos).toBe(1);
  });

  it('내가 쌓여 끝나면 topOut(endFrame)을 보내고 관전으로', () => {
    const { result } = setup();
    startMatch(result);
    for (let i = 0; i < 400 && result.current.play.status === 'playing'; i++) {
      act(() => {
        result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(50);
      });
    }
    const topOut = socket.emitted.find((e) => e.event === 'topOut')?.payload;
    expect(topOut).toEqual({ matchId: 'm1', frame: result.current.play.battleRef.current?.game.endFrame });
    expect(result.current.phase.kind).toBe('out');
  });

  it('matchEnded → 결과, 재대결로 방이 WAITING이 되면 대기실(idle)로', () => {
    const { result, rerender } = setup();
    startMatch(result);
    const results = [{ playerId: 'p1', name: '나', place: 1, kos: 2, sent: 10, received: 3, pieces: 40, maxCombo: 4, frames: 900 }];
    act(() => socket.fire('matchEnded', { matchId: 'm1', results }));
    expect(result.current.phase).toEqual({ kind: 'ended', matchId: 'm1', results });
    expect(result.current.play.status).toBe('over');
    rerender({ r: room('RESULT') });
    expect(result.current.phase.kind).toBe('ended');
    rerender({ r: room('WAITING') });
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('재연결 복구 — lastGarbageId를 알려 주고, 놓친 가비지는 겹친 id를 빼고 넣는다', () => {
    const { result } = setup();
    expect(sync?.lastGarbageId()).toBeNull(); // 매치 전
    startMatch(result);
    expect(sync?.lastGarbageId()).toBe(0);
    act(() => {
      socket.fire('garbage', { matchId: 'm1', id: 1, lines: 1, hole: 0, from: 'p2' });
      vi.advanceTimersByTime(50);
    });
    expect(sync?.lastGarbageId()).toBe(1);
    act(() => {
      sync?.onRejoin({
        match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true },
        missedGarbage: [
          { matchId: 'm1', id: 1, lines: 1, hole: 0, from: 'p2' },
          { matchId: 'm1', id: 2, lines: 2, hole: 5, from: 'p3' },
        ],
        opponents: [{ playerId: 'p2', board: encodeBoard(new Uint8Array(BOARD_ROWS * BOARD_WIDTH)), pending: 4, alive: true }],
      });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.play.battleRef.current?.received.map((g) => g.id)).toEqual([1, 2]);
    expect(result.current.opponents.find((o) => o.playerId === 'p2')?.pending).toBe(4);
  });

  it('끊긴 사이 탈락했으면(alive false) 판을 멈추고 관전으로', () => {
    const { result } = setup();
    startMatch(result);
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: false }, missedGarbage: [], opponents: [] }));
    expect(result.current.phase.kind).toBe('out');
    expect(result.current.play.status).toBe('over');
  });

  it('새로고침 재입장: 매치가 진행 중이고 내 자리가 살아 있는데 판이 없으면 topOut(frame 0)으로 기권한다 (D-020)', () => {
    const { result } = setup('PLAYING');
    act(() => sync?.onRejoin({ match: { matchId: 'm9', seed: 1, status: 'PLAYING', alive: true }, missedGarbage: [], opponents: [] }));
    expect(socket.emitted).toEqual([{ event: 'topOut', payload: { matchId: 'm9', frame: 0 } }]);
    expect(result.current.phase).toEqual({ kind: 'unavailable', forfeited: true });
  });

  it('새로고침 재입장: 이미 탈락했으면(alive false) 기권을 보내지 않는다', () => {
    const { result } = setup('PLAYING');
    act(() => sync?.onRejoin({ match: { matchId: 'm9', seed: 1, status: 'PLAYING', alive: false }, missedGarbage: [], opponents: [] }));
    expect(socket.emitted).toEqual([]);
    expect(result.current.phase).toEqual({ kind: 'unavailable', forfeited: false });
  });

  it('카운트다운 중 재연결(같은 매치)은 기권하지 않고 그대로 시작한다', () => {
    const { result } = setup();
    act(() => socket.fire('matchStarting', { matchId: 'm1', seed: 7, startInMs: 3000, startAt: '', players: PLAYERS }));
    act(() => {
      socket.fire('disconnect', undefined);
      vi.advanceTimersByTime(1000);
    });
    expect(sync?.lastGarbageId()).toBe(0);
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true }, missedGarbage: [], opponents: [] }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(socket.emitted.filter((e) => e.event === 'topOut')).toEqual([]);
    expect(result.current.phase).toEqual({ kind: 'playing', matchId: 'm1' });
  });

  it('카운트다운 중에 온 가비지(상대가 먼저 시작)는 버리지 않고 시작할 때 id 순으로 넣는다', () => {
    const { result } = setup();
    act(() => socket.fire('matchStarting', { matchId: 'm1', seed: 7, startInMs: 3000, startAt: '', players: PLAYERS }));
    act(() => {
      socket.fire('garbage', { matchId: 'm1', id: 2, lines: 1, hole: 0, from: 'p2' });
      socket.fire('garbage', { matchId: 'm1', id: 1, lines: 1, hole: 0, from: 'p2' });
      vi.advanceTimersByTime(3050);
    });
    expect(result.current.play.battleRef.current?.received.map((g) => g.id)).toEqual([1, 2]);
  });

  it('재연결 중 먼저 온 실시간 가비지와 놓친 가비지를 합쳐 id 순으로 넣는다 (서버는 순서를 보장하지 않는다)', () => {
    const { result } = setup();
    startMatch(result);
    act(() => socket.fire('disconnect', undefined));
    act(() => {
      socket.fire('garbage', { matchId: 'm1', id: 3, lines: 1, hole: 0, from: 'p2' });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.play.battleRef.current?.received).toEqual([]); // 재입장 응답까지 보류
    act(() => {
      sync?.onRejoin({
        match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true },
        missedGarbage: [
          { matchId: 'm1', id: 1, lines: 1, hole: 0, from: 'p2' },
          { matchId: 'm1', id: 2, lines: 1, hole: 0, from: 'p3' },
          { matchId: 'm1', id: 3, lines: 1, hole: 0, from: 'p2' },
        ],
        opponents: [],
      });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.play.battleRef.current?.received.map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it('끊긴 동안은 lock을 보내지 않고 보관했다가, 복귀하면 보낸 그대로 seq 순서대로 다시 보낸다', () => {
    const { result } = setup();
    startMatch(result);
    act(() => socket.fire('disconnect', undefined));
    socket.connected = false;
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(200);
      });
    }
    expect(socket.emitted.filter((e) => e.event === 'lock')).toEqual([]);
    socket.connected = true;
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true }, missedGarbage: [], opponents: [] }));
    const locks = socket.emitted.filter((e) => e.event === 'lock').map((e) => e.payload);
    expect(locks.map((l) => l.seq)).toEqual([1, 2, 3]);
    expect(locks.every((l) => l.matchId === 'm1')).toBe(true);
  });

  it('재입장 대기가 아닌데 lock이 NOT_IN_ROOM이면(서버가 이 소켓을 뗐다) 복귀를 한 번 부탁하고, 복귀 뒤 같은 lock을 다시 보낸다', () => {
    const recoverSeat = vi.fn();
    const { result } = setup('WAITING', undefined, recoverSeat);
    startMatch(result);
    socket.ack = (event) => (event === 'lock' ? { ok: false, code: 'NOT_IN_ROOM', message: 'x' } : { ok: true, data: {} });
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(50);
    });
    const sent = socket.emitted.filter((e) => e.event === 'lock');
    expect(sent).toHaveLength(1);
    expect(recoverSeat).toHaveBeenCalledTimes(1);
    socket.ack = () => ({ ok: true, data: { targetId: 'p2' } });
    act(() => sync?.onRejoin(undefined));
    const resent = socket.emitted.filter((e) => e.event === 'lock');
    expect(resent).toHaveLength(2);
    expect(resent[1].payload).toEqual(sent[0].payload);
    expect(recoverSeat).toHaveBeenCalledTimes(1);
  });

  it('응답이 없던(타임아웃) lock은 잠시 뒤 같은 내용으로 다시 보내고, 거절 응답은 다시 보내지 않는다', () => {
    const { result } = setup();
    startMatch(result);
    let mode: 'timeout' | 'reject' | 'ok' = 'timeout';
    socket.emit = (event: string, payload: Record<string, unknown>, callback?: (err: Error | null, response: unknown) => void) => {
      socket.emitted.push({ event, payload });
      if (mode === 'timeout') callback?.(new Error('operation has timed out'), undefined);
      else if (mode === 'reject') callback?.(null, { ok: false, code: 'INVALID_PAYLOAD', message: 'x' });
      else callback?.(null, { ok: true, data: { targetId: 'p2' } });
    };
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(50);
    });
    expect(socket.emitted.filter((e) => e.event === 'lock')).toHaveLength(1);
    mode = 'ok';
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    const locks = socket.emitted.filter((e) => e.event === 'lock');
    expect(locks).toHaveLength(2);
    expect(locks[1].payload).toEqual(locks[0].payload);
    expect(result.current.targetId).toBe('p2');

    mode = 'reject';
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(3000);
    });
    expect(socket.emitted.filter((e) => e.event === 'lock')).toHaveLength(3);
  });

  it('송신함: lock은 앞 항목이 확인돼야 다음을 보내고(순서 역전 방지, FE-10), 이전 매치의 늦은 응답은 새 매치 항목을 건드리지 않는다', () => {
    const { result } = setup();
    const held: { seq: unknown; matchId: unknown; cb?: (err: Error | null, response: unknown) => void }[] = [];
    socket.emit = (event: string, payload: Record<string, unknown>, callback?: (err: Error | null, response: unknown) => void) => {
      socket.emitted.push({ event, payload });
      if (event === 'lock') held.push({ seq: payload.seq, matchId: payload.matchId, cb: callback });
      else callback?.(null, { ok: true, data: {} });
    };
    const drop = () =>
      act(() => {
        result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(200);
      });
    startMatch(result, 'm1');
    drop(); // m1 seq1 — 응답 대기
    startMatch(result, 'm2');
    drop(); // m2 seq1
    act(() => held[0].cb?.(new Error('operation has timed out'), undefined)); // m1의 늦은 응답
    drop(); // m2 seq2 — seq1 확인 전이라 아직 보내지 않는다
    const m2 = () => socket.emitted.filter((e) => e.event === 'lock' && e.payload.matchId === 'm2').map((e) => e.payload.seq);
    expect(m2()).toEqual([1]);
    act(() => held[1].cb?.(null, { ok: true, data: { targetId: 'p2' } })); // m2 seq1 확인 → seq2가 나간다
    expect(m2()).toEqual([1, 2]);
    act(() => held[2].cb?.(new Error('operation has timed out'), undefined)); // m2 seq2 응답 없음
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    // seq1은 끝났고, seq2만 같은 내용으로 다시 나간다
    expect(m2()).toEqual([1, 2, 2]);
    expect(result.current.targetId).toBe('p2');
  });

  it('앞 lock이 응답 없이 끝나면 뒤 lock은 앞 lock 재전송이 확인될 때까지 기다린다 — seq가 거꾸로 닿지 않는다 (FE-10)', () => {
    const { result } = setup();
    const held: { seq: unknown; cb?: (err: Error | null, response: unknown) => void }[] = [];
    socket.emit = (event: string, payload: Record<string, unknown>, callback?: (err: Error | null, response: unknown) => void) => {
      socket.emitted.push({ event, payload });
      if (event === 'lock') held.push({ seq: payload.seq, cb: callback });
      else callback?.(null, { ok: true, data: {} });
    };
    startMatch(result);
    for (let i = 0; i < 3; i++) {
      act(() => {
        result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(200);
      });
    }
    const seqs = () => socket.emitted.filter((e) => e.event === 'lock').map((e) => e.payload.seq);
    expect(seqs()).toEqual([1]);
    act(() => held[0].cb?.(new Error('operation has timed out'), undefined));
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(seqs()).toEqual([1, 1]);
    act(() => held[1].cb?.(null, { ok: true, data: { targetId: 'p2' } }));
    act(() => held[2].cb?.(null, { ok: true, data: { targetId: 'p2' } }));
    act(() => held[3].cb?.(null, { ok: true, data: { targetId: 'p2' } }));
    // 보낸 순서가 곧 seq 순서 — 1을 다시 보낸 뒤에야 2·3
    expect(seqs()).toEqual([1, 1, 2, 3]);
  });

  it('끊긴 사이 내가 쌓여 끝났으면 복귀 후 topOut(endFrame)을 다시 보낸다', () => {
    const { result } = setup();
    startMatch(result);
    act(() => socket.fire('disconnect', undefined));
    socket.connected = false;
    for (let i = 0; i < 400 && result.current.play.status === 'playing'; i++) {
      act(() => {
        result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(50);
      });
    }
    expect(socket.emitted.filter((e) => e.event === 'topOut')).toEqual([]);
    socket.connected = true;
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true }, missedGarbage: [], opponents: [] }));
    expect(socket.emitted.filter((e) => e.event === 'topOut').map((e) => e.payload)).toEqual([
      { matchId: 'm1', frame: result.current.play.battleRef.current?.game.endFrame },
    ]);
  });

  it('roomState(RESULT)가 matchEnded보다 먼저 와도 결과를 받아 끝낸다 — "결과를 받지 못했어요"로 끝내지 않는다 (FE-17)', () => {
    const { result, rerender } = setup();
    startMatch(result);
    rerender({ r: room('RESULT') });
    expect(result.current.phase.kind).toBe('playing');
    const results = [{ playerId: 'p1', name: '나', place: 1, kos: 1, sent: 2, received: 0, pieces: 5, maxCombo: 1 }];
    act(() => socket.fire('matchEnded', { matchId: 'm1', results }));
    expect(result.current.phase).toEqual({ kind: 'ended', matchId: 'm1', results });
    act(() => {
      vi.advanceTimersByTime(RESULT_WAIT_MS);
    });
    expect(result.current.phase).toEqual({ kind: 'ended', matchId: 'm1', results });
  });

  it('결과 대기 중 재대결로 다음 매치가 시작되면 대기 타이머가 새 매치를 끝내지 않는다', () => {
    const { result, rerender } = setup();
    startMatch(result);
    rerender({ r: room('RESULT') });
    rerender({ r: room('WAITING') });
    act(() => socket.fire('matchStarting', { matchId: 'm2', seed: 9, startInMs: 3000, startAt: '', players: PLAYERS }));
    act(() => {
      vi.advanceTimersByTime(RESULT_WAIT_MS);
    });
    expect(result.current.phase).toMatchObject({ kind: 'countdown', matchId: 'm2' });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.phase).toEqual({ kind: 'playing', matchId: 'm2' });
  });

  it('화면을 떠난 뒤 늦게 온 lock 응답은 다시 보내거나 복귀를 부탁하지 않는다', () => {
    const recoverSeat = vi.fn();
    const { result, unmount } = setup('WAITING', undefined, recoverSeat);
    startMatch(result);
    const callbacks: ((err: Error | null, response: unknown) => void)[] = [];
    socket.emit = (event: string, payload: Record<string, unknown>, callback?: (err: Error | null, response: unknown) => void) => {
      socket.emitted.push({ event, payload });
      if (callback) callbacks.push(callback);
    };
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(50);
    });
    const sent = socket.emitted.filter((e) => e.event === 'lock').length;
    unmount();
    act(() => {
      for (const cb of callbacks) cb(new Error('operation has timed out'), undefined);
      vi.advanceTimersByTime(5000);
    });
    expect(socket.emitted.filter((e) => e.event === 'lock')).toHaveLength(sent);
    act(() => {
      for (const cb of callbacks) cb(null, { ok: false, code: 'NOT_IN_ROOM', message: 'x' });
    });
    expect(recoverSeat).not.toHaveBeenCalled();
  });

  it('카운트다운 중 경기가 끝나면(RESULT) 시작하지 않는다 (FE-18)', () => {
    const { result, rerender } = setup();
    act(() => socket.fire('matchStarting', { matchId: 'm1', seed: 7, startInMs: 3000, startAt: '', players: PLAYERS }));
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    // 시작 0.5초 전에 끝났다 — 결과를 기다리는 사이 시작 시각이 와도 판을 시작하지 않는다
    rerender({ r: room('RESULT') });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.play.status).not.toBe('playing');
    expect(result.current.phase.kind).toBe('countdown');
    act(() => {
      vi.advanceTimersByTime(RESULT_WAIT_MS);
    });
    expect(result.current.phase.kind).toBe('ended');
  });

  it('lock이 SERVICE_UNAVAILABLE면 보낸 그대로 다시, 순서·속도 위반(INVALID_PAYLOAD)은 버린다 (FE-03)', () => {
    const { result } = setup();
    startMatch(result);
    let calls = 0;
    socket.ack = (event) => {
      if (event !== 'lock') return { ok: true, data: {} };
      calls += 1;
      return calls === 1 ? { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'x' } : { ok: true, data: { targetId: 'p2' } };
    };
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(50);
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const locks = socket.emitted.filter((e) => e.event === 'lock');
    expect(locks).toHaveLength(2);
    expect(locks[1].payload).toEqual(locks[0].payload);
    expect(result.current.targetId).toBe('p2');
  });

  it('재입장 응답에서 끊긴 사이 탈락한 상대(alive=false)는 순위를 몰라도 탈락으로, 그 상대가 대상이면 비운다 (FE-04)', () => {
    const { result } = setup();
    startMatch(result);
    socket.ack = (event) => (event === 'lock' ? { ok: true, data: { targetId: 'p2' } } : { ok: true, data: {} });
    act(() => {
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(50);
    });
    expect(result.current.targetId).toBe('p2');
    act(() =>
      sync?.onRejoin({
        match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true },
        missedGarbage: [],
        opponents: [
          { playerId: 'p2', board: '', pending: 0, alive: false },
          { playerId: 'p3', board: '', pending: 0, alive: true },
        ],
      }),
    );
    const p2 = result.current.opponents.find((o) => o.playerId === 'p2');
    expect(p2).toMatchObject({ out: true, place: null });
    expect(result.current.opponents.find((o) => o.playerId === 'p3')?.out).toBeUndefined();
    expect(result.current.targetId).toBeNull();
  });

  it('matchEnded를 놓쳐도 방이 RESULT가 되거나 복귀 응답이 ENDED면 판을 멈추고 결과 없는 종료로', () => {
    const first = setup();
    startMatch(first.result);
    first.rerender({ r: room('RESULT') });
    // 판은 바로 멈추고, 결과는 matchEnded를 잠깐 기다린다
    expect(first.result.current.play.status).toBe('over');
    act(() => {
      vi.advanceTimersByTime(RESULT_WAIT_MS);
    });
    expect(first.result.current.phase).toEqual({ kind: 'ended', matchId: 'm1', results: [] });
    first.unmount();

    socket = new FakeSocket();
    const second = setup();
    startMatch(second.result);
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'ENDED', alive: true }, missedGarbage: [], opponents: [] }));
    expect(second.result.current.phase).toEqual({ kind: 'ended', matchId: 'm1', results: [] });
    expect(second.result.current.play.status).toBe('over');
  });

  it('다음 매치 카운트다운 중의 lastGarbageId는 이전 매치 판이 아니라 0', () => {
    const { result } = setup();
    startMatch(result);
    act(() => {
      socket.fire('garbage', { matchId: 'm1', id: 4, lines: 1, hole: 0, from: 'p2' });
      vi.advanceTimersByTime(50);
    });
    expect(sync?.lastGarbageId()).toBe(4);
    act(() => socket.fire('matchStarting', { matchId: 'm2', seed: 8, startInMs: 3000, startAt: '', players: PLAYERS }));
    expect(sync?.lastGarbageId()).toBe(0);
  });

  it('결과 화면에서 잠깐 끊겼다 복귀해(rejoin ENDED) 받은 결과를 지우지 않는다', () => {
    const { result } = setup();
    startMatch(result);
    const results = [{ playerId: 'p1', name: '나', place: 1, kos: 0, sent: 0, received: 0, pieces: 1, maxCombo: 0, frames: 10 }];
    act(() => socket.fire('matchEnded', { matchId: 'm1', results }));
    act(() => socket.fire('disconnect', undefined));
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'ENDED', alive: true }, missedGarbage: [], opponents: [] }));
    expect(result.current.phase).toEqual({ kind: 'ended', matchId: 'm1', results });
  });

  it('경기 중 소켓이 새로 만들어지면(로그인 변화) 재입장 응답까지 가비지를 보류한다', () => {
    const { result, rerender } = setup();
    startMatch(result);
    const next = new FakeSocket();
    socket = next;
    rerender({ r: room('PLAYING') });
    act(() => {
      next.fire('garbage', { matchId: 'm1', id: 2, lines: 1, hole: 0, from: 'p2' });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.play.battleRef.current?.received).toEqual([]);
    act(() => {
      sync?.onRejoin({
        match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: true },
        missedGarbage: [{ matchId: 'm1', id: 1, lines: 1, hole: 0, from: 'p2' }],
        opponents: [],
      });
      vi.advanceTimersByTime(50);
    });
    expect(result.current.play.battleRef.current?.received.map((g) => g.id)).toEqual([1, 2]);
  });

  it('리플레이 제출: 이 기기에 그 매치의 판이 있으면 종료 때 1회 — 생존자는 멈춘 프레임까지, 검증 가능한 형식', async () => {
    let resolve: (status: 'saved') => void = () => {};
    const submit = vi.fn(() => new Promise<'saved'>((r) => (resolve = r)));
    const { result, rerender } = setup('WAITING', submit);
    startMatch(result);
    act(() => {
      socket.fire('garbage', { matchId: 'm1', id: 1, lines: 2, hole: 3, from: 'p2' });
      result.current.play.instant(ACTION.HARD_DROP);
      vi.advanceTimersByTime(800);
    });
    rerender({ r: room('RESULT') }); // 놓친 종료 → 결과 없는 종료
    act(() => socket.fire('matchEnded', { matchId: 'm1', results: [] })); // 뒤늦게 온 종료
    expect(submit).toHaveBeenCalledTimes(1);
    const [matchId, replay] = submit.mock.calls[0] as unknown as [string, BattleReplayInput];
    expect(matchId).toBe('m1');
    const game = result.current.play.battleRef.current?.game;
    expect(replay.frames).toBe(game?.frame);
    expect(replay.garbage.length).toBe(4);
    expect(simulateBattleReplay(replay).ok).toBe(true);
    expect(result.current.replaySubmit).toEqual({ matchId: 'm1', status: 'submitting' });
    await act(async () => resolve('saved'));
    expect(result.current.replaySubmit).toEqual({ matchId: 'm1', status: 'saved' });
  });

  it('리플레이 제출: 판이 없으면(카운트다운 중 종료·새로고침 기권·관전만) 보내지 않는다', () => {
    const submit = vi.fn(() => Promise.resolve('saved' as const));
    const { result } = setup('WAITING', submit);
    act(() => socket.fire('matchStarting', { matchId: 'm1', seed: 7, startInMs: 3000, startAt: '', players: PLAYERS }));
    act(() => socket.fire('matchEnded', { matchId: 'm1', results: [] }));
    expect(result.current.phase.kind).toBe('ended');
    const reloaded = setup('PLAYING', submit);
    act(() => sync?.onRejoin({ match: { matchId: 'm9', seed: 1, status: 'PLAYING', alive: true }, missedGarbage: [], opponents: [] }));
    act(() => socket.fire('matchEnded', { matchId: 'm9', results: [] }));
    expect(reloaded.result.current.phase.kind).toBe('unavailable');
    expect(submit).not.toHaveBeenCalled();
  });

  it('리플레이 제출: 서버가 탈락시킨 경우(끊김 KO·재입장 alive=false)는 보내지 않고, 내 판이 스스로 끝난 KO는 보낸다', () => {
    const submit = vi.fn(() => Promise.resolve('saved' as const));
    const first = setup('WAITING', submit);
    startMatch(first.result, 'm1');
    act(() => socket.fire('playerKO', { matchId: 'm1', playerId: 'p1', by: null, place: 3, reason: 'disconnect' }));
    act(() => socket.fire('matchEnded', { matchId: 'm1', results: [] }));
    startMatch(first.result, 'm2');
    act(() => sync?.onRejoin({ match: { matchId: 'm2', seed: 7, status: 'PLAYING', alive: false }, missedGarbage: [], opponents: [] }));
    act(() => socket.fire('matchEnded', { matchId: 'm2', results: [] }));
    expect(submit).not.toHaveBeenCalled();

    startMatch(first.result, 'm3');
    for (let i = 0; i < 400 && first.result.current.play.status === 'playing'; i++) {
      act(() => {
        first.result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(50);
      });
    }
    act(() => socket.fire('playerKO', { matchId: 'm3', playerId: 'p1', by: 'p2', place: 3, reason: 'topout' }));
    act(() => socket.fire('matchEnded', { matchId: 'm3', results: [] }));
    expect(submit.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['m3']);
  });

  it('리플레이 제출: 끊긴 사이 내가 탑아웃했어도 서버가 끊김으로 탈락시켰으면(rejoin alive=false·disconnect KO) 보내지 않는다', () => {
    const submit = vi.fn(() => Promise.resolve('saved' as const));
    const { result } = setup('WAITING', submit);
    const topOutLocally = () => {
      for (let i = 0; i < 400 && result.current.play.status === 'playing'; i++) {
        act(() => {
          result.current.play.instant(ACTION.HARD_DROP);
          vi.advanceTimersByTime(50);
        });
      }
    };
    startMatch(result, 'm1');
    act(() => socket.fire('disconnect', undefined));
    topOutLocally();
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: false }, missedGarbage: [], opponents: [] }));
    act(() => socket.fire('matchEnded', { matchId: 'm1', results: [] }));
    startMatch(result, 'm2');
    topOutLocally();
    act(() => socket.fire('playerKO', { matchId: 'm2', playerId: 'p1', by: null, place: 2, reason: 'disconnect' }));
    act(() => socket.fire('matchEnded', { matchId: 'm2', results: [] }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('리플레이 제출: 내 topOut으로 탈락이 확정된 뒤 관전 중 끊겨 재입장(alive=false)해도 제출한다 (예상 제출자, D-022 ④)', () => {
    const submit = vi.fn(() => Promise.resolve('saved' as const));
    const { result } = setup('WAITING', submit);
    startMatch(result, 'm1');
    for (let i = 0; i < 400 && result.current.play.status === 'playing'; i++) {
      act(() => {
        result.current.play.instant(ACTION.HARD_DROP);
        vi.advanceTimersByTime(50);
      });
    }
    act(() => socket.fire('playerKO', { matchId: 'm1', playerId: 'p1', by: 'p2', place: 3, reason: 'topout' }));
    act(() => socket.fire('disconnect', undefined));
    act(() => sync?.onRejoin({ match: { matchId: 'm1', seed: 7, status: 'PLAYING', alive: false }, missedGarbage: [], opponents: [] }));
    act(() => socket.fire('matchEnded', { matchId: 'm1', results: [] }));
    expect(submit.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['m1']);
  });

  it('리플레이 제출: 재대결로 다음 판이 시작돼도 이전 제출은 이어서 끝나고, 다음 판은 따로 보낸다', async () => {
    const resolvers: ((status: 'saved') => void)[] = [];
    const submit = vi.fn(() => new Promise<'saved'>((r) => resolvers.push(r)));
    const { result, rerender } = setup('WAITING', submit);
    startMatch(result, 'm1');
    act(() => socket.fire('matchEnded', { matchId: 'm1', results: [] }));
    rerender({ r: room('WAITING') }); // 재대결
    startMatch(result, 'm2');
    await act(async () => resolvers[0]('saved'));
    expect(result.current.replaySubmit).toEqual({ matchId: 'm1', status: 'saved' });
    act(() => socket.fire('matchEnded', { matchId: 'm2', results: [] }));
    expect(submit.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(['m1', 'm2']);
    expect(result.current.replaySubmit).toEqual({ matchId: 'm2', status: 'submitting' });
  });

  it('방이 경기 중인데 이 기기에 판이 없으면(새로고침 등) 잠깐 기다린 뒤 참여 불가 — 끝나면 대기실로', () => {
    const { result, rerender } = setup('PLAYING');
    expect(result.current.phase).toEqual({ kind: 'idle' });
    act(() => {
      vi.advanceTimersByTime(UNAVAILABLE_GRACE_MS);
    });
    expect(result.current.phase).toEqual({ kind: 'unavailable', forfeited: false });
    rerender({ r: room('RESULT') });
    expect(result.current.phase).toEqual({ kind: 'idle' });
  });

  it('방 상태(PLAYING)가 matchStarting보다 먼저 와도 "진행 중인 게임"을 띄우지 않고 카운트다운으로 간다 (FE-15)', () => {
    const { result, rerender } = setup('WAITING');
    rerender({ r: room('PLAYING') });
    act(() => {
      vi.advanceTimersByTime(UNAVAILABLE_GRACE_MS / 2);
    });
    expect(result.current.phase).toEqual({ kind: 'idle' });
    act(() => socket.fire('matchStarting', { matchId: 'm1', seed: 7, startInMs: 3000, startAt: '', players: PLAYERS }));
    expect(result.current.phase.kind).toBe('countdown');
    act(() => {
      vi.advanceTimersByTime(UNAVAILABLE_GRACE_MS);
    });
    expect(result.current.phase.kind).toBe('countdown');
  });
});
