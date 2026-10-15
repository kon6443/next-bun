import type { ChatReceivedPayload, SocketErrorPayload } from '@/types/socket';

/**
 * 팀 채팅 메시지 (클라이언트 로컬 상태)
 *
 * - key: React key 겸 로컬 식별자. 본인 메시지는 clientMsgId, 서버 ID만 있으면 `s{serverId}`
 * - serverId: 서버 발급 ID. 옛 형식 수신분과 아직 서버 응답을 못 받은 낙관적 메시지는 null
 */
export interface TeamChatMessage {
  key: string;
  clientMsgId: string | null;
  serverId: number | null;
  sender: string;
  text: string;
  timestamp: number;
  isMine: boolean;
  failed?: boolean;
}

/**
 * chatReceived 페이로드의 식별자를 정규화한다.
 *
 * - 옛 형식 `{ messageId: clientMsgId(string) }` → clientMsgId = messageId, serverId = null
 * - 새 형식 `{ messageId: number, clientMsgId }` → 둘 다 그대로
 */
export function normalizeChatIds(payload: ChatReceivedPayload): {
  clientMsgId: string | null;
  serverId: number | null;
} {
  if (typeof payload.messageId === 'number') {
    return { clientMsgId: payload.clientMsgId ?? null, serverId: payload.messageId };
  }
  return { clientMsgId: payload.clientMsgId ?? payload.messageId, serverId: null };
}

/**
 * 수신 메시지를 목록에 병합한다.
 *
 * clientMsgId 또는 serverId가 같은 메시지가 이미 있으면(본인 낙관적 추가분·중복 수신) 새로 넣지 않고,
 * 서버 ID만 채운다. 변경이 없으면 같은 배열을 그대로 돌려준다(리렌더 방지).
 */
export function mergeChatReceived(
  prev: TeamChatMessage[],
  payload: ChatReceivedPayload,
  currentUserId?: number,
): TeamChatMessage[] {
  const { clientMsgId, serverId } = normalizeChatIds(payload);
  const index = prev.findIndex(
    (m) =>
      (clientMsgId !== null && m.clientMsgId === clientMsgId) ||
      (serverId !== null && m.serverId === serverId),
  );

  if (index >= 0) {
    const existing = prev[index];
    if (serverId === null || existing.serverId === serverId) return prev;
    const next = [...prev];
    next[index] = { ...existing, serverId, failed: false };
    return next;
  }

  return [
    ...prev,
    {
      key: clientMsgId ?? `s${serverId}`,
      clientMsgId,
      serverId,
      sender: payload.userName,
      text: payload.message,
      timestamp: new Date(payload.timestamp).getTime(),
      isMine: currentUserId != null && payload.userId === currentUserId,
    },
  ];
}

/** 해당 clientMsgId의 메시지를 '전송 실패'로 표시한다. 대상이 없으면 같은 배열을 돌려준다. */
export function markChatFailed(prev: TeamChatMessage[], clientMsgId: string): TeamChatMessage[] {
  const index = prev.findIndex((m) => m.clientMsgId === clientMsgId);
  if (index < 0 || prev[index].failed) return prev;
  const next = [...prev];
  next[index] = { ...prev[index], failed: true };
  return next;
}

/**
 * 채팅 전송 거부 에러인지 판별한다 (연결 에러 상태와 분리하기 위함).
 * 새 백엔드는 clientMsgId를 싣고, 옛 백엔드는 CHAT_NOT_JOINED 코드만 보낸다.
 */
export function isChatError(payload: SocketErrorPayload): boolean {
  return payload.clientMsgId != null || payload.code?.startsWith('CHAT_') === true;
}
