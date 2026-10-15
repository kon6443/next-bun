import { describe, it, expect } from 'vitest';
import {
  normalizeChatIds,
  mergeChatReceived,
  mergeChatMessages,
  markChatFailed,
  isChatError,
  createPendingMessage,
  getOldestServerId,
  getNewestServerId,
  countOthersInRange,
  applyMemberCursor,
  upsertMember,
  removeMember,
  mergeReadState,
  getChatReaders,
  countUnreadReaders,
  formatBadgeCount,
  isDifferentLocalDay,
  formatChatDateDivider,
  markUnconfirmedFailed,
  replaceWithLatestPage,
  shouldResyncOnVisible,
} from './teamChatUtils';
import type { ChatReceivedPayload } from '@/types/socket';
import type { ChatMemberReadState } from '@/services/teamService';

const CLIENT_ID = '0b6e1c1e-1111-4a4a-8888-000000000001';

function payload(overrides: Partial<ChatReceivedPayload> = {}): ChatReceivedPayload {
  return {
    messageId: CLIENT_ID,
    teamId: 7,
    userId: 1,
    userName: '홍길동',
    message: '안녕',
    timestamp: '2026-10-14T01:00:00.000Z',
    ...overrides,
  };
}

/** 서버가 저장한 새 형식 메시지 */
function saved(messageId: number, userId = 2): ChatReceivedPayload {
  return payload({ messageId, clientMsgId: `c-${messageId}`, userId });
}

function member(userId: number, lastReadMessageId: number): ChatMemberReadState {
  return { userId, userName: `user${userId}`, lastReadMessageId };
}

describe('normalizeChatIds', () => {
  it('옛 형식: messageId 문자열을 clientMsgId로 본다', () => {
    expect(normalizeChatIds(payload())).toEqual({ clientMsgId: CLIENT_ID, serverId: null });
  });

  it('새 형식: messageId 숫자는 serverId, clientMsgId는 별도 필드', () => {
    expect(normalizeChatIds(payload({ messageId: 101, clientMsgId: CLIENT_ID }))).toEqual({
      clientMsgId: CLIENT_ID,
      serverId: 101,
    });
  });
});

describe('mergeChatReceived', () => {
  it('옛 형식: 본인 echo는 낙관적 메시지와 합쳐져 한 번만 보인다', () => {
    const prev = [createPendingMessage(CLIENT_ID, '안녕', 1)];
    expect(mergeChatReceived(prev, payload(), 1)).toBe(prev);
  });

  it('새 형식: 본인 echo는 한 번만 보이고 serverId가 채워진다', () => {
    const prev = [createPendingMessage(CLIENT_ID, '안녕', 1)];
    const next = mergeChatReceived(prev, payload({ messageId: 101, clientMsgId: CLIENT_ID }), 1);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ key: CLIENT_ID, serverId: 101, isMine: true });
  });

  it('같은 메시지를 두 번 받으면 무시한다 (옛·새 형식 모두)', () => {
    const once = mergeChatReceived([], payload(), 2);
    expect(mergeChatReceived(once, payload(), 2)).toBe(once);

    const newOnce = mergeChatReceived([], saved(101), 2);
    expect(mergeChatReceived(newOnce, saved(101), 2)).toBe(newOnce);
  });

  it('타인 메시지는 보낸 사람·isMine을 기록한다', () => {
    const next = mergeChatReceived([], payload({ messageId: 101, clientMsgId: CLIENT_ID, userId: 2 }), 1);
    expect(next).toEqual([
      {
        key: 's101',
        clientMsgId: CLIENT_ID,
        serverId: 101,
        userId: 2,
        sender: '홍길동',
        text: '안녕',
        timestamp: Date.parse('2026-10-14T01:00:00.000Z'),
        isMine: false,
      },
    ]);
  });

  it('currentUserId가 없으면 isMine은 false', () => {
    expect(mergeChatReceived([], payload())[0].isMine).toBe(false);
  });

  it('clientMsgId 없는 새 형식은 serverId로 key를 만든다', () => {
    const next = mergeChatReceived([], payload({ messageId: 101 }), 1);
    expect(next[0]).toMatchObject({ key: 's101', clientMsgId: null, serverId: 101 });
  });
});

describe('mergeChatMessages (이력·보정 병합)', () => {
  it('다른 사람이 같은 clientMsgId를 써도 별개 메시지로 둔다 (멱등 키는 사용자별)', () => {
    const mine = mergeChatReceived([], payload({ messageId: 101, clientMsgId: CLIENT_ID, userId: 1 }), 1);
    const next = mergeChatReceived(mine, payload({ messageId: 102, clientMsgId: CLIENT_ID, userId: 2 }), 1);
    expect(next.map((m) => [m.serverId, m.userId])).toEqual([
      [101, 1],
      [102, 2],
    ]);
    expect(new Set(next.map((m) => m.key)).size).toBe(2);
  });

  it('옛 형식도 보낸 사람이 다르면 별개 메시지 (key 충돌 없음)', () => {
    const a = mergeChatReceived([], payload({ userId: 2 }), 1);
    const b = mergeChatReceived(a, payload({ userId: 3 }), 1);
    expect(b).toHaveLength(2);
    expect(b[0].key).not.toBe(b[1].key);
  });

  it('서버 ID 오름차순, 전송 중 메시지는 보낼 때의 최신 메시지 바로 뒤에 둔다', () => {
    const base = mergeChatMessages([], [saved(101), saved(102)], 1);
    const withPending = [...base, createPendingMessage('mine', '전송 중', 1, 102)];
    const next = mergeChatMessages(withPending, [saved(100), saved(105)], 1);
    expect(next.map((m) => m.serverId ?? m.key)).toEqual([100, 101, 102, 'mine', 105]);
  });

  it('실패한 메시지가 맨 아래에 고정되지 않는다 — 이후 수신분은 그 아래에 쌓인다', () => {
    const base = mergeChatMessages([], [saved(101)], 1);
    const failed = markChatFailed([...base, createPendingMessage('lost', 'x', 1, 101)], 'lost');
    const next = mergeChatMessages(failed, [saved(102), saved(103)], 1);
    expect(next.map((m) => m.serverId ?? m.key)).toEqual([101, 'lost', 102, 103]);
    expect(next[next.length - 1].serverId).toBe(103);
  });

  it('본인 echo로 서버 ID가 생기면 순서 자리로 옮긴다', () => {
    const prev = mergeChatMessages([createPendingMessage(CLIENT_ID, '안녕', 1)], [saved(110)], 1);
    const next = mergeChatReceived(prev, payload({ messageId: 108, clientMsgId: CLIENT_ID, userId: 1 }), 1);
    expect(next.map((m) => m.serverId)).toEqual([108, 110]);
  });

  it('이력과 소켓 수신이 겹치면 한 번만 넣는다', () => {
    const live = mergeChatMessages([], [saved(150), saved(151)], 1);
    const next = mergeChatMessages(live, [saved(149), saved(150), saved(151)], 1);
    expect(next.map((m) => m.serverId)).toEqual([149, 150, 151]);
  });

  it('새로 들어온 것이 없으면 같은 배열을 돌려준다', () => {
    const live = mergeChatMessages([], [saved(150)], 1);
    expect(mergeChatMessages(live, [saved(150)], 1)).toBe(live);
    expect(mergeChatMessages(live, [], 1)).toBe(live);
  });
});

describe('getOldestServerId / getNewestServerId', () => {
  it('서버 ID가 있는 메시지만 본다', () => {
    const list = mergeChatMessages([createPendingMessage('p', 'x', 1)], [saved(120), saved(101)], 1);
    expect(getOldestServerId(list)).toBe(101);
    expect(getNewestServerId(list)).toBe(120);
  });

  it('없으면 null', () => {
    expect(getOldestServerId([])).toBeNull();
    expect(getNewestServerId([createPendingMessage('p', 'x', 1)])).toBeNull();
  });
});

describe('countOthersInRange', () => {
  it('(afterId, upToId] 구간에서 남이 보낸 메시지만 센다', () => {
    const list = mergeChatMessages([], [saved(101, 2), saved(102, 1), saved(103, 3), saved(104, 2)], 1);
    expect(countOthersInRange(list, 1, 101, 103)).toBe(1);
    expect(countOthersInRange(list, 1, 100, 104)).toBe(3);
  });
});

describe('applyMemberCursor', () => {
  it('커서는 올라가기만 한다', () => {
    const members = [member(1, 100)];
    expect(applyMemberCursor(members, 1, 105)[0].lastReadMessageId).toBe(105);
    expect(applyMemberCursor(members, 1, 90)).toBe(members);
  });

  it('모르는 멤버면 그대로 둔다', () => {
    const members = [member(1, 100)];
    expect(applyMemberCursor(members, 9, 105)).toBe(members);
  });
});

describe('upsertMember / removeMember', () => {
  it('가입하면 추가하고, 재가입이면 커서를 큰 값으로 갱신한다', () => {
    const members = [member(1, 100)];
    expect(upsertMember(members, member(2, 120))).toEqual([member(1, 100), member(2, 120)]);
    expect(upsertMember(members, member(1, 90))[0].lastReadMessageId).toBe(100);
  });

  it('비활성화하면 뺀다', () => {
    const members = [member(1, 100), member(2, 100)];
    expect(removeMember(members, 2)).toEqual([member(1, 100)]);
    expect(removeMember(members, 9)).toBe(members);
  });
});

describe('mergeReadState', () => {
  it('명단은 서버를 따르고 커서는 큰 값을 쓴다', () => {
    const local = [member(1, 110), member(2, 100), member(3, 100)];
    const server = [member(1, 105), member(2, 108)];
    expect(mergeReadState(local, server)).toEqual([member(1, 110), member(2, 108)]);
  });
});

describe('안 읽은 인원 · 명단 (DESIGN §2 예시: A·B·C·D, 메시지 103은 A가 보냄)', () => {
  const members = [member(1, 104), member(2, 102), member(3, 103), member(4, 0)];
  const message103 = { serverId: 103, userId: 1 };

  it('안 읽은 인원은 보낸 사람을 빼고 센다', () => {
    expect(countUnreadReaders(message103, members)).toBe(2);
  });

  it('읽음: C · 안 읽음: B, D', () => {
    const readers = getChatReaders(message103, members);
    expect(readers?.read.map((m) => m.userId)).toEqual([3]);
    expect(readers?.unread.map((m) => m.userId)).toEqual([2, 4]);
  });

  it('서버 ID가 없는 메시지는 계산하지 않는다', () => {
    expect(countUnreadReaders({ serverId: null, userId: 1 }, members)).toBeNull();
    expect(getChatReaders({ serverId: null, userId: 1 }, members)).toBeNull();
  });
});

describe('markChatFailed', () => {
  it('해당 메시지만 실패로 표시한다', () => {
    const prev = [createPendingMessage('a', 'x', 1), createPendingMessage('b', 'y', 1)];
    const next = markChatFailed(prev, 'b');
    expect(next[0].failed).toBeUndefined();
    expect(next[1].failed).toBe(true);
  });

  it('대상이 없으면 같은 배열을 돌려준다', () => {
    const prev = [createPendingMessage('a', 'x', 1)];
    expect(markChatFailed(prev, 'zzz')).toBe(prev);
  });

  it('이미 저장이 확인된(서버 ID 있는) 메시지는 실패로 표시하지 않는다 — 타임아웃이 보정 교체보다 늦은 경우', () => {
    const confirmed = mergeChatReceived(
      [createPendingMessage('a', 'x', 1, 0)],
      payload({ messageId: 101, clientMsgId: 'a', userId: 1 }),
      1,
    );
    expect(markChatFailed(confirmed, 'a')).toBe(confirmed);
  });
});

describe('isChatError', () => {
  it('옛 백엔드의 CHAT_NOT_JOINED (clientMsgId 없음)', () => {
    expect(isChatError({ code: 'CHAT_NOT_JOINED', message: 'x' })).toBe(true);
  });

  it('새 백엔드의 CHAT_RATE_LIMITED + clientMsgId', () => {
    expect(isChatError({ code: 'CHAT_RATE_LIMITED', message: 'x', clientMsgId: CLIENT_ID })).toBe(true);
  });

  it('채팅과 무관한 에러는 false', () => {
    expect(isChatError({ code: 'UNAUTHORIZED', message: 'x' })).toBe(false);
  });
});

describe('formatBadgeCount', () => {
  it('0 이하는 숨김, 99 초과는 99+', () => {
    expect(formatBadgeCount(0)).toBeNull();
    expect(formatBadgeCount(-1)).toBeNull();
    expect(formatBadgeCount(1)).toBe('1');
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
  });
});

describe('날짜 구분선 (로컬 기준)', () => {
  it('로컬 자정을 넘으면 다른 날', () => {
    const lateNight = new Date(2026, 9, 14, 23, 59).getTime();
    const nextMorning = new Date(2026, 9, 15, 0, 1).getTime();
    const sameDay = new Date(2026, 9, 14, 0, 0).getTime();
    expect(isDifferentLocalDay(lateNight, nextMorning)).toBe(true);
    expect(isDifferentLocalDay(sameDay, lateNight)).toBe(false);
  });

  it('"2026년 10월 14일 수요일" 형식', () => {
    expect(formatChatDateDivider(new Date(2026, 9, 14, 12, 0).getTime())).toBe('2026년 10월 14일 수요일');
  });
});

describe('끊김 중 응답 없는 전송 메시지', () => {
  it('보정 뒤에도 응답이 없으면 실패로, 보정 교체로 저장이 확인되면 그대로 둔다', () => {
    const pending = [createPendingMessage('lost', 'x', 1), createPendingMessage('saved', 'y', 1)];
    const afterGapFill = mergeChatMessages(pending, [payload({ messageId: 120, clientMsgId: 'saved', userId: 1 })], 1);
    const next = markUnconfirmedFailed(afterGapFill, new Set(['lost', 'saved']));
    expect(next.find((m) => m.clientMsgId === 'lost')?.failed).toBe(true);
    expect(next.find((m) => m.clientMsgId === 'saved')?.failed).toBeFalsy();
  });

  it('대상이 없으면 같은 배열을 돌려준다', () => {
    const list = [createPendingMessage('a', 'x', 1)];
    expect(markUnconfirmedFailed(list, new Set(['zzz']))).toBe(list);
  });
});

describe('replaceWithLatestPage (재연결·탭 복귀 보정, D-024)', () => {
  it('서버 메시지를 최신 페이지로 교체하고 전송 중 메시지는 남긴다 (보낸 시점 기준 자리 유지)', () => {
    const before = [
      ...mergeChatMessages([], [saved(10), saved(11), saved(12)], 1),
      createPendingMessage('old', 'x', 1, 12),
      createPendingMessage('recent', 'y', 1, 20),
    ];
    const next = replaceWithLatestPage(before, [saved(20), saved(21)], 1);
    // 12 뒤에 보낸 것은 페이지보다 앞, 20 뒤에 보낸 것은 20 바로 뒤
    expect(next.map((m) => m.serverId ?? m.key)).toEqual(['old', 20, 'recent', 21]);
  });

  it('조회 중 소켓으로 먼저 받은 페이지 이후 메시지는 잃지 않는다', () => {
    const before = mergeChatMessages([], [saved(10), saved(22)], 1);
    const next = replaceWithLatestPage(before, [saved(20), saved(21)], 1);
    expect(next.map((m) => m.serverId)).toEqual([20, 21, 22]);
  });

  it('교체 결과에 echo가 있으면 내 메시지가 확정되고, 없으면 미확인으로 남는다', () => {
    const before = [createPendingMessage('saved', 'a', 1, 0), createPendingMessage('lost', 'b', 1, 0)];
    const next = replaceWithLatestPage(before, [payload({ messageId: 30, clientMsgId: 'saved', userId: 1 })], 1);
    expect(next.find((m) => m.clientMsgId === 'saved')?.serverId).toBe(30);
    expect(markUnconfirmedFailed(next, new Set(['saved', 'lost'])).find((m) => m.clientMsgId === 'lost')?.failed).toBe(true);
  });

  it('빈 페이지면(서버에 메시지 없음) 받아 둔 메시지를 모두 남긴다', () => {
    const before = mergeChatMessages([], [saved(1)], 1);
    expect(replaceWithLatestPage(before, [], 1).map((m) => m.serverId)).toEqual([1]);
  });
});

describe('shouldResyncOnVisible', () => {
  it('보정한 적이 없으면 한다', () => {
    expect(shouldResyncOnVisible(null, 1_000)).toBe(true);
  });

  it('마지막 보정 후 30초가 지나야 다시 한다', () => {
    expect(shouldResyncOnVisible(0, 29_999)).toBe(false);
    expect(shouldResyncOnVisible(0, 30_000)).toBe(true);
  });
});
