import { describe, it, expect } from 'vitest';
import { normalizeChatIds, mergeChatReceived, markChatFailed, isChatError, type TeamChatMessage } from './teamChatUtils';
import type { ChatReceivedPayload } from '@/types/socket';

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

/** TeamChatPanel.handleSend의 낙관적 추가분과 같은 모양 */
function optimistic(clientMsgId: string): TeamChatMessage {
  return { key: clientMsgId, clientMsgId, serverId: null, sender: '나', text: '안녕', timestamp: 0, isMine: true };
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
    const prev = [optimistic(CLIENT_ID)];
    expect(mergeChatReceived(prev, payload(), 1)).toBe(prev);
  });

  it('새 형식: 본인 echo는 한 번만 보이고 serverId가 채워진다', () => {
    const prev = [optimistic(CLIENT_ID)];
    const next = mergeChatReceived(prev, payload({ messageId: 101, clientMsgId: CLIENT_ID }), 1);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ key: CLIENT_ID, serverId: 101, isMine: true });
  });

  it('같은 메시지를 두 번 받으면 무시한다 (옛·새 형식 모두)', () => {
    const once = mergeChatReceived([], payload(), 2);
    expect(mergeChatReceived(once, payload(), 2)).toBe(once);

    const newOnce = mergeChatReceived([], payload({ messageId: 101, clientMsgId: CLIENT_ID }), 2);
    expect(mergeChatReceived(newOnce, payload({ messageId: 101, clientMsgId: CLIENT_ID }), 2)).toBe(newOnce);
  });

  it('타인 메시지는 뒤에 추가하고 isMine을 판정한다', () => {
    const next = mergeChatReceived([], payload({ messageId: 101, clientMsgId: CLIENT_ID, userId: 2 }), 1);
    expect(next).toEqual([
      {
        key: CLIENT_ID,
        clientMsgId: CLIENT_ID,
        serverId: 101,
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

describe('markChatFailed', () => {
  it('해당 메시지만 실패로 표시한다', () => {
    const prev = [optimistic('a'), optimistic('b')];
    const next = markChatFailed(prev, 'b');
    expect(next[0].failed).toBeUndefined();
    expect(next[1].failed).toBe(true);
  });

  it('대상이 없으면 같은 배열을 돌려준다', () => {
    const prev = [optimistic('a')];
    expect(markChatFailed(prev, 'zzz')).toBe(prev);
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
