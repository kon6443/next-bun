import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatOutbox, type ChatOutboxItem } from './chatOutbox';

const TIMEOUT_MS = 10_000;

function setup(canSend = true) {
  const sent: string[] = [];
  const timedOut: string[] = [];
  const state = { canSend };
  const outbox = new ChatOutbox({
    send: (item: ChatOutboxItem) => {
      if (!state.canSend) return false;
      sent.push(item.clientMsgId);
      return true;
    },
    onTimeout: (id) => timedOut.push(id),
    timeoutMs: TIMEOUT_MS,
  });
  const enqueue = (...ids: string[]) => ids.forEach((id) => outbox.enqueue({ clientMsgId: id, message: id }));
  return { outbox, sent, timedOut, state, enqueue };
}

describe('ChatOutbox (D-025 소켓당 전송 1건)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('한 번에 1건만 보내고, 결과를 받기 전에는 다음 건을 보내지 않는다', () => {
    const { sent, enqueue, outbox } = setup();
    enqueue('a', 'b', 'c');
    expect(sent).toEqual(['a']);
    expect(outbox.size).toBe(3);
  });

  it('echo를 받으면 다음 건으로 진행하고, 보낸 순서를 유지한다', () => {
    const { sent, enqueue, outbox } = setup();
    enqueue('a', 'b', 'c');
    expect(outbox.settle('a')).toBe(true);
    expect(outbox.settle('b')).toBe(true);
    expect(sent).toEqual(['a', 'b', 'c']);
  });

  it('에러를 받아도 다음 건으로 진행한다', () => {
    const { sent, enqueue, outbox } = setup();
    enqueue('a', 'b');
    outbox.settle('a'); // 에러 수신도 같은 settle
    expect(sent).toEqual(['a', 'b']);
  });

  it('진행 중이 아닌 clientMsgId(늦게 온 echo·다른 탭)는 무시한다', () => {
    const { sent, enqueue, outbox } = setup();
    enqueue('a', 'b');
    expect(outbox.settle('b')).toBe(false);
    expect(outbox.settle('zzz')).toBe(false);
    expect(sent).toEqual(['a']);
  });

  it('타임아웃이면 실패로 알리고 다음 건으로 진행한다', () => {
    const { sent, timedOut, enqueue } = setup();
    enqueue('a', 'b');
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(timedOut).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(timedOut).toEqual(['a']);
    expect(sent).toEqual(['a', 'b']);
  });

  it('결과를 받으면 타임아웃은 울리지 않는다', () => {
    const { timedOut, enqueue, outbox } = setup();
    enqueue('a');
    outbox.settle('a');
    vi.advanceTimersByTime(TIMEOUT_MS * 2);
    expect(timedOut).toEqual([]);
  });

  it('보낼 수 없는 동안(끊김·room 참가 전)은 기다렸다가, pump 때 순서대로 보낸다', () => {
    const { sent, state, enqueue, outbox } = setup(false);
    enqueue('a', 'b');
    expect(sent).toEqual([]);
    state.canSend = true;
    outbox.pump();
    expect(sent).toEqual(['a']);
    outbox.settle('a');
    expect(sent).toEqual(['a', 'b']);
  });

  it('끊기면 진행 중 1건은 내려놓고(재전송 없음), 대기 중인 건은 다시 참가한 뒤 보낸다', () => {
    const { sent, timedOut, state, enqueue, outbox } = setup();
    enqueue('a', 'b');
    state.canSend = false;
    expect(outbox.abandonInFlight()).toBe('a');
    vi.advanceTimersByTime(TIMEOUT_MS);
    expect(timedOut).toEqual([]); // 내려놓은 건의 타임아웃은 울리지 않음
    state.canSend = true;
    outbox.pump();
    expect(sent).toEqual(['a', 'b']); // a는 다시 보내지 않는다
  });
});
