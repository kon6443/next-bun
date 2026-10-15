import type { ChatReceivedPayload, SocketErrorPayload } from '@/types/socket';
import type { ChatMemberReadState } from '@/services/teamService';
import { WEEKDAYS_KO } from '@/app/utils/dateUtils';
import { formatDateKey } from '@/app/utils/taskUtils';

/**
 * 팀 채팅 메시지 (클라이언트 로컬 상태)
 *
 * - key: React key. 내가 이 탭에서 보낸 메시지는 clientMsgId(확정 후에도 유지), 받은 메시지는 `s{serverId}`
 * - serverId: 서버 발급 ID. 옛 형식 수신분과 아직 서버 응답을 못 받은 낙관적 메시지는 null
 * - userId: 보낸 사람. 안 읽은 인원 계산에서 보낸 사람을 빼는 데 쓴다
 */
export interface TeamChatMessage {
  key: string;
  clientMsgId: string | null;
  serverId: number | null;
  userId: number | null;
  sender: string;
  text: string;
  timestamp: number;
  isMine: boolean;
  failed?: boolean;
  /** 전송 중 메시지만: 보낼 때 목록의 최신 서버 ID — 이 메시지 바로 뒤에 표시한다 (실패해도 자리 유지) */
  anchorServerId?: number;
}

// ===== 메시지 목록 =====

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
 * 낙관적 메시지 (서버 응답 전)
 * @param anchorServerId 보낼 때 목록의 최신 서버 ID (없으면 0)
 */
export function createPendingMessage(
  clientMsgId: string,
  text: string,
  userId: number | null,
  anchorServerId = 0,
): TeamChatMessage {
  return {
    key: clientMsgId,
    clientMsgId,
    serverId: null,
    userId,
    sender: '나',
    text,
    timestamp: Date.now(),
    isMine: true,
    anchorServerId,
  };
}

/**
 * 서버 ID가 있는 메시지는 ID 오름차순. 서버 ID가 없는 메시지(전송 중·실패)는 보낼 때의 최신 메시지(anchor) 바로 뒤에 둔다.
 * 실패 메시지가 맨 아래에 고정돼 이후 메시지가 그 위로 쌓이는 것을 막는다. anchor가 없는 옛 형식 수신분은 맨 뒤(도착 순).
 */
function orderMessages(messages: TeamChatMessage[]): TeamChatMessage[] {
  const confirmed = messages.filter((m) => m.serverId !== null).sort((a, b) => (a.serverId ?? 0) - (b.serverId ?? 0));
  const pending = messages
    .filter((m) => m.serverId === null)
    .map((m, index) => ({ m, index, anchor: m.anchorServerId ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.anchor - b.anchor || a.index - b.index);

  const ordered: TeamChatMessage[] = [];
  let p = 0;
  for (const c of confirmed) {
    while (p < pending.length && pending[p].anchor < (c.serverId ?? 0)) ordered.push(pending[p++].m);
    ordered.push(c);
  }
  while (p < pending.length) ordered.push(pending[p++].m);
  return ordered;
}

/**
 * 수신·조회한 메시지들을 목록에 병합한다 (소켓 수신, 이력 조회, 보정 교체 공용).
 *
 * clientMsgId 또는 serverId가 같은 메시지가 이미 있으면(본인 낙관적 추가분·중복 수신·이력과 겹침)
 * 새로 넣지 않고 서버 ID만 채운다. 변경이 없으면 같은 배열을 그대로 돌려준다(리렌더 방지).
 */
export function mergeChatMessages(
  prev: TeamChatMessage[],
  payloads: ChatReceivedPayload[],
  currentUserId?: number,
): TeamChatMessage[] {
  let next = prev;
  let changed = false;

  for (const payload of payloads) {
    const { clientMsgId, serverId } = normalizeChatIds(payload);
    // clientMsgId는 보낸 사람 안에서만 고유하다 (백엔드 멱등 키 = 팀·사용자·clientMsgId)
    const index = next.findIndex(
      (m) =>
        (clientMsgId !== null && m.clientMsgId === clientMsgId && m.userId === payload.userId) ||
        (serverId !== null && m.serverId === serverId),
    );

    if (index >= 0) {
      const existing = next[index];
      if (serverId === null || existing.serverId === serverId) continue;
      if (!changed) next = [...next];
      next[index] = { ...existing, serverId, failed: false, anchorServerId: undefined };
      changed = true;
      continue;
    }

    if (!changed) next = [...next];
    next.push({
      // 확정 메시지는 서버 ID로, 옛 형식은 보낸 사람까지 붙여 key 충돌을 막는다
      key: serverId !== null ? `s${serverId}` : `${payload.userId}:${clientMsgId}`,
      clientMsgId,
      serverId,
      userId: payload.userId,
      sender: payload.userName,
      text: payload.message,
      timestamp: new Date(payload.timestamp).getTime(),
      isMine: currentUserId != null && payload.userId === currentUserId,
    });
    changed = true;
  }

  return changed ? orderMessages(next) : prev;
}

/**
 * 재연결·탭 복귀 보정 (D-024): 서버 메시지를 최신 페이지로 통째로 교체한다.
 * - 전송 중(serverId 없음) 메시지는 남긴다
 * - 조회 중 소켓으로 먼저 받은 페이지 이후 메시지(serverId > 페이지 lastId)도 남긴다
 */
export function replaceWithLatestPage(
  prev: TeamChatMessage[],
  page: ChatReceivedPayload[],
  currentUserId?: number,
): TeamChatMessage[] {
  const last = page[page.length - 1];
  const lastId = typeof last?.messageId === 'number' ? last.messageId : 0;
  return mergeChatMessages(
    prev.filter((m) => m.serverId === null || m.serverId > lastId),
    page,
    currentUserId,
  );
}

/** 단건 수신 병합 */
export function mergeChatReceived(
  prev: TeamChatMessage[],
  payload: ChatReceivedPayload,
  currentUserId?: number,
): TeamChatMessage[] {
  return mergeChatMessages(prev, [payload], currentUserId);
}

/** 해당 clientMsgId의 메시지를 '전송 실패'로 표시한다. 대상이 없으면 같은 배열을 돌려준다. */
export function markChatFailed(prev: TeamChatMessage[], clientMsgId: string): TeamChatMessage[] {
  const index = prev.findIndex((m) => m.clientMsgId === clientMsgId);
  // 이미 서버 ID가 있으면(보정 교체로 저장 확인됨) 실패로 표시하지 않는다
  if (index < 0 || prev[index].failed || prev[index].serverId !== null) return prev;
  const next = [...prev];
  next[index] = { ...prev[index], failed: true };
  return next;
}

/**
 * 끊기기 전에 보냈는데 보정이 끝나도 서버 ID를 못 받은 메시지를 '전송 실패'로 표시한다.
 * 서버가 저장했다면 보정 교체(최신 페이지)에서 serverId가 채워졌으므로 대상에서 빠진다.
 */
export function markUnconfirmedFailed(prev: TeamChatMessage[], clientMsgIds: ReadonlySet<string>): TeamChatMessage[] {
  let changed = false;
  const next = prev.map((m) => {
    if (m.serverId !== null || m.failed || m.clientMsgId === null || !clientMsgIds.has(m.clientMsgId)) return m;
    changed = true;
    return { ...m, failed: true };
  });
  return changed ? next : prev;
}

/** 서버 ID가 있는 메시지 중 가장 오래된 ID (위로 스크롤 조회의 beforeId). 없으면 null */
export function getOldestServerId(messages: TeamChatMessage[]): number | null {
  return messages.find((m) => m.serverId !== null)?.serverId ?? null;
}

/** 서버 ID가 있는 메시지 중 가장 최신 ID (전송 중 메시지의 배치 기준). 없으면 null */
export function getNewestServerId(messages: TeamChatMessage[]): number | null {
  let newest: number | null = null;
  for (const m of messages) {
    if (m.serverId !== null && (newest === null || m.serverId > newest)) newest = m.serverId;
  }
  return newest;
}

/**
 * (afterId, upToId] 구간에서 남이 보낸 메시지 수 — 내 커서가 전진할 때 안읽음 수에서 뺄 양.
 * 로컬에 있는 메시지만 센다.
 */
export function countOthersInRange(
  messages: TeamChatMessage[],
  currentUserId: number | undefined,
  afterId: number,
  upToId: number,
): number {
  return messages.filter(
    (m) => m.serverId !== null && m.serverId > afterId && m.serverId <= upToId && m.userId !== currentUserId,
  ).length;
}

// ===== 읽음 커서 =====

/**
 * 멤버 커서를 올린다 (Math.max — 커서는 뒤로 가지 않는다).
 * 멤버가 없거나 값이 그대로면 같은 배열을 돌려준다.
 */
export function applyMemberCursor(
  members: ChatMemberReadState[],
  userId: number,
  lastReadMessageId: number,
): ChatMemberReadState[] {
  const index = members.findIndex((m) => m.userId === userId);
  if (index < 0 || members[index].lastReadMessageId >= lastReadMessageId) return members;
  const next = [...members];
  next[index] = { ...members[index], lastReadMessageId };
  return next;
}

/** 멤버를 추가하거나(가입) 이미 있으면 이름·커서를 갱신한다(재가입) */
export function upsertMember(members: ChatMemberReadState[], member: ChatMemberReadState): ChatMemberReadState[] {
  const index = members.findIndex((m) => m.userId === member.userId);
  if (index < 0) return [...members, member];
  const next = [...members];
  next[index] = {
    ...member,
    lastReadMessageId: Math.max(members[index].lastReadMessageId, member.lastReadMessageId),
  };
  return next;
}

/** 멤버를 뺀다 (비활성화) */
export function removeMember(members: ChatMemberReadState[], userId: number): ChatMemberReadState[] {
  return members.some((m) => m.userId === userId) ? members.filter((m) => m.userId !== userId) : members;
}

/**
 * 서버 read-state로 멤버 목록을 맞춘다.
 * 명단은 서버를 따르고, 커서는 로컬과 서버 중 큰 값을 쓴다(조회 중 도착한 chatReadUpdated 보존).
 */
export function mergeReadState(local: ChatMemberReadState[], server: ChatMemberReadState[]): ChatMemberReadState[] {
  return server.map((s) => {
    const l = local.find((m) => m.userId === s.userId);
    return l && l.lastReadMessageId > s.lastReadMessageId ? { ...s, lastReadMessageId: l.lastReadMessageId } : s;
  });
}

/**
 * 메시지의 읽음·안읽음 명단 (보낸 사람 제외).
 * 서버 ID가 없는 메시지는 계산할 수 없어 null.
 */
export function getChatReaders(
  message: Pick<TeamChatMessage, 'serverId' | 'userId'>,
  members: ChatMemberReadState[],
): { read: ChatMemberReadState[]; unread: ChatMemberReadState[] } | null {
  if (message.serverId === null) return null;
  const serverId = message.serverId;
  const others = members.filter((m) => m.userId !== message.userId);
  return {
    read: others.filter((m) => m.lastReadMessageId >= serverId),
    unread: others.filter((m) => m.lastReadMessageId < serverId),
  };
}

/** 메시지의 안 읽은 인원 수 (보낸 사람 제외). 계산할 수 없으면 null */
export function countUnreadReaders(
  message: Pick<TeamChatMessage, 'serverId' | 'userId'>,
  members: ChatMemberReadState[],
): number | null {
  if (message.serverId === null) return null;
  const serverId = message.serverId;
  return members.filter((m) => m.userId !== message.userId && m.lastReadMessageId < serverId).length;
}

// ===== 표시 =====

/** 숫자 배지 문구 — 0 이하는 null(숨김), 99 초과는 `99+` (D-022) */
export function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/** 두 시각이 로컬 기준 다른 날인지 (날짜 구분선 위치) */
export function isDifferentLocalDay(a: number, b: number): boolean {
  return formatDateKey(new Date(a)) !== formatDateKey(new Date(b));
}

/** 날짜 구분선 문구 (로컬) — "2026년 10월 14일 수요일" */
export function formatChatDateDivider(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS_KO[date.getDay()]}요일`;
}

// ===== 에러 =====

/**
 * 채팅 전송 거부 에러인지 판별한다 (연결 에러 상태와 분리하기 위함).
 * 새 백엔드는 clientMsgId를 싣고, 옛 백엔드는 CHAT_NOT_JOINED 코드만 보낸다.
 */
export function isChatError(payload: SocketErrorPayload): boolean {
  return payload.clientMsgId != null || payload.code?.startsWith('CHAT_') === true;
}

/** 탭 복귀 시 보정 최소 간격 — 탭을 잠깐 오갈 때마다 read-state·최신 페이지를 다시 받지 않게 */
export const VISIBLE_RESYNC_MIN_INTERVAL_MS = 30_000;

/**
 * 탭이 다시 보일 때 보정을 할지
 * 마지막 보정을 시작한 지 최소 간격이 지났을 때만 한다. 보정한 적이 없으면(null) 한다.
 * 소켓 재입장으로 인한 보정은 이 간격과 무관하게 따로 돈다.
 */
export function shouldResyncOnVisible(
  lastResyncStartedAt: number | null,
  now: number,
  minIntervalMs = VISIBLE_RESYNC_MIN_INTERVAL_MS,
): boolean {
  return lastResyncStartedAt === null || now - lastResyncStartedAt >= minIntervalMs;
}
