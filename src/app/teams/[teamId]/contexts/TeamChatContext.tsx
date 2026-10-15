'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { TeamSocketEvents } from '@/types/socket';
import type {
  ChatReceivedPayload,
  ChatReadUpdatedPayload,
  MemberJoinedPayload,
  MemberStatusChangedPayload,
  SocketErrorPayload,
} from '@/types/socket';
import { getChatMessages, getChatReadState, type ChatMemberReadState } from '@/services/teamService';
import { extractErrorMessage } from '@/app/utils/errorUtils';
import {
  applyMemberCursor,
  countOthersInRange,
  createPendingMessage,
  getNewestServerId,
  getOldestServerId,
  isChatError,
  markChatFailed,
  markUnconfirmedFailed,
  mergeChatMessages,
  mergeChatReceived,
  mergeReadState,
  normalizeChatIds,
  removeMember,
  replaceWithLatestPage,
  upsertMember,
  type TeamChatMessage,
} from '@/app/utils/teamChatUtils';
import { ChatOutbox } from '@/app/utils/chatOutbox';
import { useTeamSocketContext } from './TeamSocketContext';

// ===== 설정 =====

const CHAT_CONFIG = {
  /** 처음 열 때·위로 스크롤할 때·보정할 때 불러오는 개수 */
  pageSize: 50,
  /** 보정 실패 재시도 (2s, 4s, 8s…) */
  resyncRetryBaseMs: 2000,
  resyncRetryMaxAttempts: 5,
  /** 읽음 전송 묶음 간격 (D-019) */
  readDebounceMs: 1000,
  /** 전송 대기열: 진행 중 1건이 결과(echo·에러)를 못 받으면 실패로 보고 다음 건으로 (D-025) */
  sendTimeoutMs: 10_000,
} as const;

// ===== Context 타입 =====

interface TeamChatContextValue {
  /** 메시지 목록 (서버 ID 오름차순, 전송 중 메시지는 보낼 때의 최신 메시지 뒤) */
  messages: TeamChatMessage[];
  /** 활성 멤버별 읽음 위치 (본인 포함) */
  members: ChatMemberReadState[];
  /** 내 안읽음 수 (남이 보낸 메시지만) */
  myUnreadCount: number;
  /** 더 오래된 메시지가 있는지 */
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  /** 첫 이력 조회 완료 여부 */
  isHistoryLoaded: boolean;
  isChatOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  /** 메시지 전송 (낙관적 추가 + 전송 대기열). 빈 메시지면 false */
  sendMessage: (text: string) => boolean;
  /** 위로 스크롤 — 더 오래된 페이지 조회 */
  loadOlder: () => Promise<void>;
  currentUserId?: number;
}

const TeamChatContext = createContext<TeamChatContextValue | null>(null);

interface ResyncOptions {
  /** false면 read-state만 다시 조회하고 목록은 교체하지 않는다 (기본 true — 재참가·탭 복귀) */
  replaceList?: boolean;
}

interface TeamChatProviderProps {
  children: ReactNode;
  teamId: number;
}

/**
 * 팀 채팅 상태 Provider
 *
 * teams/[teamId] 레이아웃에서 TeamSocketProvider 안쪽에 둔다.
 * 팀 보드 ↔ 태스크 상세를 오가도 메시지·읽음 상태·안읽음 수가 유지된다.
 *
 * 동작 원리 (백엔드 docs/tasks/team-chat-persistence/DESIGN.md):
 * - 이력: 패널을 처음 열 때 최신 페이지, 위로 스크롤하면 beforeId로 이전 페이지 (keyset)
 * - 읽음: 패널 열림 + 탭 보임이면 최신까지 읽음, 1초 단위로 최댓값만 chatRead 전송
 * - 보정 (D-024): room 재참가·탭 복귀 시 read-state 재조회 + (이력을 열었으면) 최신 페이지로 서버 메시지 통째 교체.
 *   끊긴 구간을 추측해 끼워 넣지 않는다. 보정이 끝날 때까지 읽음 처리는 보류한다
 */
export function TeamChatProvider({ children, teamId }: TeamChatProviderProps) {
  const { data: session } = useSession();
  const accessToken = session?.user?.accessToken;
  const currentUserId = session?.user?.userId;
  const { socket, roomJoinCount, emitChatMessage, emitChatRead } = useTeamSocketContext();

  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMemberReadState[]>([]);
  const [myUnreadCount, setMyUnreadCount] = useState(0);
  const [myLastReadId, setMyLastReadId] = useState(0);
  const [latestMessageId, setLatestMessageId] = useState(0);
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'loading' | 'loaded'>('idle');
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  /** 보정이 성공하기 전까지 true — 그동안 읽음 처리를 보류한다 */
  const [isSyncPending, setIsSyncPending] = useState(true);

  // 소켓 핸들러·비동기 콜백에서 최신 값을 읽기 위한 ref
  const accessTokenRef = useRef(accessToken);
  const currentUserIdRef = useRef(currentUserId);
  const messagesRef = useRef(messages);
  const myLastReadRef = useRef(0);
  const latestIdRef = useRef(0);
  const historyStatusRef = useRef(historyStatus);
  accessTokenRef.current = accessToken;
  currentUserIdRef.current = currentUserId;
  messagesRef.current = messages;
  historyStatusRef.current = historyStatus;

  // ----- 최신 메시지 ID -----

  const raiseLatestId = useCallback((id: number) => {
    if (id <= latestIdRef.current) return;
    latestIdRef.current = id;
    setLatestMessageId(id);
  }, []);

  // ----- 읽음 전송 (1초 묶음, 최댓값만) -----

  /** 서버에 보냈거나 서버가 이미 가진 내 커서 */
  const sentReadIdRef = useRef(0);
  const pendingReadIdRef = useRef(0);
  const readTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRead = useCallback(() => {
    if (readTimerRef.current) {
      clearTimeout(readTimerRef.current);
      readTimerRef.current = null;
    }
    if (pendingReadIdRef.current > sentReadIdRef.current && emitChatRead(pendingReadIdRef.current)) {
      sentReadIdRef.current = pendingReadIdRef.current;
    }
  }, [emitChatRead]);

  const scheduleRead = useCallback(
    (id: number) => {
      pendingReadIdRef.current = Math.max(pendingReadIdRef.current, id);
      if (readTimerRef.current) return;
      readTimerRef.current = setTimeout(flushRead, CHAT_CONFIG.readDebounceMs);
    },
    [flushRead],
  );

  // 떠날 때 남은 읽음을 보낸다. 언마운트 시 passive 정리는 부모(TeamSocketProvider의 disconnect)부터 돌기 때문에
  // layout 정리(그보다 먼저 실행)에서 보내야 소켓이 살아 있다
  useLayoutEffect(() => flushRead, [flushRead]);

  // ----- 내 커서 -----

  /** 내 커서를 올리고 안읽음 수를 맞춘다 (서버 전송은 하지 않음) */
  const advanceMyCursor = useCallback((id: number) => {
    const previous = myLastReadRef.current;
    if (id <= previous) return;
    myLastReadRef.current = id;
    setMyLastReadId(id);
    const userId = currentUserIdRef.current;
    if (userId != null) setMembers((prev) => applyMemberCursor(prev, userId, id));
    setMyUnreadCount((prev) =>
      id >= latestIdRef.current
        ? 0
        : Math.max(0, prev - countOthersInRange(messagesRef.current, userId, previous, id)),
    );
  }, []);

  // ----- 미확인 전송 → '전송 실패' -----

  /** 끊기는 순간 서버 응답을 못 받은 내 전송 메시지 — 보정 교체 뒤에도 서버 ID가 없으면 '전송 실패' */
  const unconfirmedAtDisconnectRef = useRef<Set<string>>(new Set());
  const [unconfirmedCheck, setUnconfirmedCheck] = useState<ReadonlySet<string> | null>(null);

  // 교체 결과가 반영된 렌더 뒤에 판정한다
  useEffect(() => {
    if (!unconfirmedCheck) return;
    setUnconfirmedCheck(null);
    if (markUnconfirmedFailed(messages, unconfirmedCheck) === messages) return;
    // 함수형 갱신 — 이 effect 전에 큐에 들어간 수신 메시지를 덮어쓰지 않는다
    setMessages((prev) => markUnconfirmedFailed(prev, unconfirmedCheck));
    toast.error('연결이 끊겨 일부 메시지가 전송되지 않았습니다.');
  }, [unconfirmedCheck, messages]);

  // ----- 보정: read-state + 최신 페이지 교체 (D-024) -----

  const isResyncingRef = useRef(false);
  const resyncAgainRef = useRef(false);
  const resyncAgainReplaceRef = useRef(false);
  /** 이력 조회 중에 보정이 왔으면, 이력이 도착한 뒤 한 번 더 보정한다 (조회 스냅샷 이후 메시지를 놓치지 않도록) */
  const resyncAfterHistoryRef = useRef(false);
  /** 목록을 통째로 교체할 때마다 증가 — 그 전에 시작한 이전 페이지 조회 결과는 버린다 */
  const listEpochRef = useRef(0);
  const resyncRetryCountRef = useRef(0);
  const resyncRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 재시도가 목록 교체까지 해야 하는지 (실패한 요청들의 교체 의도를 합친 값) */
  const resyncRetryReplaceRef = useRef(false);
  const resyncRef = useRef<(options?: ResyncOptions) => Promise<void>>(async () => {});
  const isUnmountedRef = useRef(false);
  const [isReadStateLoaded, setIsReadStateLoaded] = useState(false);

  const resync = useCallback(async (options: ResyncOptions = {}) => {
    const token = accessTokenRef.current;
    if (!token) return;
    const replaceRequested = options.replaceList !== false;
    if (isResyncingRef.current) {
      // 대기 중 요청은 교체가 필요한 쪽으로 합친다
      resyncAgainRef.current = true;
      if (replaceRequested) resyncAgainReplaceRef.current = true;
      return;
    }
    isResyncingRef.current = true;
    setIsSyncPending(true);
    // 이 보정이 판정할 미확인 건은 조회 시작 전에 끊긴 것만 — 시작 뒤 끊긴 건은 이 스냅샷 이후에 저장됐을 수 있다
    const judgeable = new Set(unconfirmedAtDisconnectRef.current);

    try {
      const replaceList = replaceRequested && historyStatusRef.current === 'loaded';
      if (replaceRequested && historyStatusRef.current === 'loading') resyncAfterHistoryRef.current = true;

      const [{ data: readState }, page] = await Promise.all([
        getChatReadState(teamId, token),
        replaceList ? getChatMessages(teamId, token, { limit: CHAT_CONFIG.pageSize }) : Promise.resolve(null),
      ]);

      if (page) {
        listEpochRef.current += 1;
        setMessages((prev) => replaceWithLatestPage(prev, page.data.messages, currentUserIdRef.current));
        setHasMoreOlder(page.data.hasMore);
        const last = page.data.messages[page.data.messages.length - 1];
        if (last) raiseLatestId(last.messageId);
      }

      raiseLatestId(readState.latestMessageId);
      setMembers((prev) => mergeReadState(prev, readState.members));
      setIsReadStateLoaded(true);

      // 서버 스냅샷 이후 소켓으로 이미 받은 남의 메시지 (조회 중 +1 된 것을 덮어쓰지 않도록 더한다)
      const arrivedSinceSnapshot = countOthersInRange(
        messagesRef.current,
        currentUserIdRef.current,
        readState.latestMessageId,
        Number.MAX_SAFE_INTEGER,
      );
      const serverMine = readState.myLastReadMessageId;
      if (serverMine >= myLastReadRef.current) {
        myLastReadRef.current = serverMine;
        setMyLastReadId(serverMine);
        sentReadIdRef.current = Math.max(sentReadIdRef.current, serverMine);
        setMyUnreadCount(readState.myUnreadCount + arrivedSinceSnapshot);
      } else {
        // 로컬이 앞서 있다 — 보낸 chatRead가 반영되지 않았다(끊김·레이트 리밋). 다시 보낸다.
        // 서버 안읽음 수는 서버 커서 기준이므로 (서버 커서, 로컬 커서] 구간의 남의 메시지를 뺀다
        const localMine = myLastReadRef.current;
        sentReadIdRef.current = serverMine;
        scheduleRead(localMine);
        const known = page
          ? mergeChatMessages(messagesRef.current, page.data.messages, currentUserIdRef.current)
          : messagesRef.current;
        const alreadyRead = countOthersInRange(known, currentUserIdRef.current, serverMine, localMine);
        setMyUnreadCount(
          localMine >= latestIdRef.current
            ? 0
            : Math.max(0, readState.myUnreadCount - alreadyRead + arrivedSinceSnapshot),
        );
      }

      // 교체 결과에 echo가 없으면 '전송 실패' (판정은 교체가 렌더된 뒤 effect에서)
      if (page && judgeable.size > 0) {
        setUnconfirmedCheck(judgeable);
        for (const id of judgeable) unconfirmedAtDisconnectRef.current.delete(id);
      }

      // 다른 트리거로 성공했으면 걸려 있던 재시도는 필요 없다 (또 교체해 스크롤을 초기화하지 않도록)
      resyncRetryCountRef.current = 0;
      // 교체를 요청한 보정이 성공했으면 밀린 교체 의도도 충족됐다
      if (replaceRequested) resyncRetryReplaceRef.current = false;
      if (resyncRetryTimerRef.current && !resyncRetryReplaceRef.current) {
        // 걸린 재시도가 이번 성공으로 대체될 때만 해제 (read-state만 성공했는데 교체 재시도가 남았으면 유지)
        clearTimeout(resyncRetryTimerRef.current);
        resyncRetryTimerRef.current = null;
      }
      // 교체 의도가 남아 있으면(재시도 대기 중이거나 재시도를 다 써 버림) 읽음 보류를 풀지 않는다 —
      // 다음 재참가·탭 복귀·패널 열기의 교체 보정이 풀어 준다
      if (!resyncRetryTimerRef.current && !resyncRetryReplaceRef.current) setIsSyncPending(false);
    } catch (err) {
      console.warn('[TeamChat] 보정 실패:', err);
      // 실패하면 읽음 처리가 보류된 채라 재시도한다.
      // 이미 걸린 재시도가 있어도 교체 요청은 합친다 (read-state만 재시도하다 교체가 빠지지 않도록)
      if (replaceRequested) resyncRetryReplaceRef.current = true;
      const attempt = resyncRetryCountRef.current;
      if (!isUnmountedRef.current && attempt < CHAT_CONFIG.resyncRetryMaxAttempts && !resyncRetryTimerRef.current) {
        resyncRetryCountRef.current = attempt + 1;
        resyncRetryTimerRef.current = setTimeout(() => {
          resyncRetryTimerRef.current = null;
          const replaceList = resyncRetryReplaceRef.current;
          resyncRetryReplaceRef.current = false;
          void resyncRef.current({ replaceList });
        }, CHAT_CONFIG.resyncRetryBaseMs * 2 ** attempt);
      }
    } finally {
      isResyncingRef.current = false;
      if (resyncAgainRef.current) {
        const replaceAgain = resyncAgainReplaceRef.current;
        resyncAgainRef.current = false;
        resyncAgainReplaceRef.current = false;
        void resync({ replaceList: replaceAgain });
      }
    }
  }, [teamId, raiseLatestId, scheduleRead]);
  resyncRef.current = resync;

  // ----- 전송 대기열 (D-025): 소켓당 1건씩 보내 보낸 순서 = 저장 순서 -----

  const emitChatMessageRef = useRef(emitChatMessage);
  emitChatMessageRef.current = emitChatMessage;
  const outboxRef = useRef<ChatOutbox | null>(null);
  if (!outboxRef.current) {
    outboxRef.current = new ChatOutbox({
      send: (item) => emitChatMessageRef.current(item),
      onTimeout: (clientMsgId) => {
        // 보정 교체로 이미 저장이 확인됐으면(서버 ID 있음) 실패가 아니다 — 표시도 토스트도 하지 않는다
        const target = messagesRef.current.find((m) => m.clientMsgId === clientMsgId);
        if (target?.serverId != null) return;
        setMessages((prev) => markChatFailed(prev, clientMsgId));
        toast.error('응답이 없어 메시지 전송에 실패했습니다.');
      },
      timeoutMs: CHAT_CONFIG.sendTimeoutMs,
    });
  }
  const outbox = outboxRef.current;

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      if (resyncRetryTimerRef.current) clearTimeout(resyncRetryTimerRef.current);
      outbox.dispose();
    };
  }, [outbox]);

  // ----- REST: 이력 -----

  const loadInitialHistory = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token || historyStatusRef.current !== 'idle') return;
    historyStatusRef.current = 'loading';
    setHistoryStatus('loading');

    try {
      const { data } = await getChatMessages(teamId, token, { limit: CHAT_CONFIG.pageSize });
      listEpochRef.current += 1;
      // 이력 전에 소켓으로 받아 둔 메시지는 교체와 같은 규칙으로 정리한다 (페이지보다 오래된 것은 구간이 끊겨 버린다)
      setMessages((prev) => replaceWithLatestPage(prev, data.messages, currentUserIdRef.current));
      const last = data.messages[data.messages.length - 1];
      if (last) raiseLatestId(last.messageId);
      setHasMoreOlder(data.hasMore);
      historyStatusRef.current = 'loaded';
      setHistoryStatus('loaded');
      if (resyncAfterHistoryRef.current) {
        resyncAfterHistoryRef.current = false;
        void resync();
      }
    } catch (err) {
      historyStatusRef.current = 'idle';
      setHistoryStatus('idle');
      toast.error(extractErrorMessage(err, '채팅 이력을 불러오지 못했습니다.'));
    }
  }, [teamId, raiseLatestId, resync]);

  const isLoadingOlderRef = useRef(false);

  const loadOlder = useCallback(async () => {
    const token = accessTokenRef.current;
    const oldest = getOldestServerId(messagesRef.current);
    if (!token || oldest === null || !hasMoreOlder || isLoadingOlderRef.current) return;
    isLoadingOlderRef.current = true;
    setIsLoadingOlder(true);
    const epoch = listEpochRef.current;

    try {
      const { data } = await getChatMessages(teamId, token, { beforeId: oldest, limit: CHAT_CONFIG.pageSize });
      // 조회 중에 목록이 교체됐으면 이 페이지는 새 목록과 이어지지 않는다 — 버린다
      if (epoch !== listEpochRef.current) return;
      setMessages((prev) => mergeChatMessages(prev, data.messages, currentUserIdRef.current));
      setHasMoreOlder(data.hasMore);
    } catch (err) {
      toast.error(extractErrorMessage(err, '이전 메시지를 불러오지 못했습니다.'));
    } finally {
      isLoadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [teamId, hasMoreOlder]);

  // ----- 소켓 이벤트 -----

  useEffect(() => {
    if (!socket) return;

    // 보정(read-state 조회) 중에 온 멤버 이벤트는 더 오래된 서버 스냅샷에 덮인다 — 끝난 뒤 read-state를 한 번 더 받는다
    const recheckIfResyncing = () => {
      if (isResyncingRef.current) resyncAgainRef.current = true;
    };

    const handleChatReceived = (payload: ChatReceivedPayload) => {
      setMessages((prev) => mergeChatReceived(prev, payload, currentUserIdRef.current));

      const { serverId, clientMsgId } = normalizeChatIds(payload);
      // 내 echo — 전송 대기열의 다음 건으로 (옛 형식 echo도 포함)
      if (clientMsgId && payload.userId === currentUserIdRef.current) outbox.settle(clientMsgId);
      if (serverId === null) return;
      const isNewer = serverId > latestIdRef.current;
      raiseLatestId(serverId);

      // 보낸 사람은 그 메시지까지 읽은 것으로 본다 (서버도 같은 트랜잭션에서 커서를 올린다)
      if (payload.userId === currentUserIdRef.current) {
        advanceMyCursor(serverId);
        sentReadIdRef.current = Math.max(sentReadIdRef.current, serverId);
      } else {
        setMembers((prev) => applyMemberCursor(prev, payload.userId, serverId));
        if (isNewer && serverId > myLastReadRef.current) setMyUnreadCount((prev) => prev + 1);
      }
    };

    const handleChatReadUpdated = (payload: ChatReadUpdatedPayload) => {
      if (payload.userId === currentUserIdRef.current) {
        // 본인의 다른 탭에서 읽음
        advanceMyCursor(payload.lastReadMessageId);
        sentReadIdRef.current = Math.max(sentReadIdRef.current, payload.lastReadMessageId);
        return;
      }
      setMembers((prev) => applyMemberCursor(prev, payload.userId, payload.lastReadMessageId));
      recheckIfResyncing();
    };

    const handleMemberJoined = (payload: MemberJoinedPayload) => {
      setMembers((prev) =>
        upsertMember(prev, {
          userId: payload.userId,
          userName: payload.userName,
          lastReadMessageId: payload.lastReadMessageId,
        }),
      );
      recheckIfResyncing();
    };

    const handleMemberStatusChanged = (payload: MemberStatusChangedPayload) => {
      if (payload.newStatus === 0) {
        setMembers((prev) => removeMember(prev, payload.userId));
        recheckIfResyncing();
      } else if (payload.newStatus === 1) {
        // 재활성화 시 서버가 커서를 최신으로 초기화한다 — 페이로드에 커서가 없어 read-state만 재조회 (목록 교체는 D-024 시점에만)
        void resync({ replaceList: false });
      }
    };

    // 채팅 전송 거부 (연결 에러 상태는 TeamSocketContext가 CHAT_* 를 제외하고 관리)
    // clientMsgId가 없는 CHAT_* 는 chatRead 거부다 — 사용자가 한 일이 아니라 토스트 없이 넘긴다(보정이 다시 보냄)
    const handleError = (payload: SocketErrorPayload) => {
      if (!isChatError(payload)) return;
      const { clientMsgId } = payload;
      if (!clientMsgId) {
        console.warn('[TeamChat] 채팅 이벤트 거부:', payload);
        return;
      }
      setMessages((prev) => markChatFailed(prev, clientMsgId));
      toast.error(payload.message || '메시지 전송에 실패했습니다.');
      outbox.settle(clientMsgId);
    };

    // 끊김: 결과를 못 받은 진행 중 1건은 이후 시작하는 보정 교체에서 판정한다 (자동 재전송 없음).
    // 아직 보내지 않은 대기 건은 그대로 두고 재참가 후 이어서 보낸다
    const handleDisconnect = () => {
      const abandoned = outbox.abandonInFlight();
      if (abandoned) unconfirmedAtDisconnectRef.current.add(abandoned);
      setIsSyncPending(true);
    };

    socket.on('disconnect', handleDisconnect);
    socket.on(TeamSocketEvents.CHAT_RECEIVED, handleChatReceived);
    socket.on(TeamSocketEvents.CHAT_READ_UPDATED, handleChatReadUpdated);
    socket.on(TeamSocketEvents.MEMBER_JOINED, handleMemberJoined);
    socket.on(TeamSocketEvents.MEMBER_STATUS_CHANGED, handleMemberStatusChanged);
    socket.on(TeamSocketEvents.ERROR, handleError);

    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off(TeamSocketEvents.CHAT_RECEIVED, handleChatReceived);
      socket.off(TeamSocketEvents.CHAT_READ_UPDATED, handleChatReadUpdated);
      socket.off(TeamSocketEvents.MEMBER_JOINED, handleMemberJoined);
      socket.off(TeamSocketEvents.MEMBER_STATUS_CHANGED, handleMemberStatusChanged);
      socket.off(TeamSocketEvents.ERROR, handleError);
    };
  }, [socket, raiseLatestId, advanceMyCursor, resync, outbox]);

  // room에 (다시) 참가할 때마다 보정 — 팀 화면 밖·끊긴 동안 온 메시지와 읽음 변화를 맞춘다.
  // 끊긴 동안 쌓인 전송 대기열도 이어서 보낸다
  useEffect(() => {
    if (roomJoinCount === 0) return;
    void resync();
    outbox.pump();
  }, [roomJoinCount, resync, outbox]);

  // ----- 탭 보임 상태 -----

  useEffect(() => {
    const handleVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible) {
        void resync();
      } else {
        flushRead();
      }
    };
    // 첫 보정은 room 참가 시점에 한다 (여기서도 하면 진입 시 read-state를 두 번 부른다)
    setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [resync, flushRead]);

  // ----- 읽음 처리: 패널 열림 + 탭 보임 + 이력 로드 완료 + 보정 완료 → 최신까지 읽음 (D-019, D-024) -----

  useEffect(() => {
    if (!isChatOpen || !isVisible || historyStatus !== 'loaded' || isSyncPending) return;
    if (latestMessageId <= myLastReadId) return;
    advanceMyCursor(latestMessageId);
    scheduleRead(latestMessageId);
  }, [isChatOpen, isVisible, historyStatus, isSyncPending, latestMessageId, myLastReadId, advanceMyCursor, scheduleRead]);

  // ----- 패널 -----

  const openChat = useCallback(() => {
    setIsChatOpen(true);
    void loadInitialHistory();
    // 소켓이 붙기 전이라 read-state를 못 받았거나, 보정이 실패한 채 남은 경우
    if (!isReadStateLoaded || isSyncPending) void resync();
  }, [loadInitialHistory, isReadStateLoaded, isSyncPending, resync]);

  const closeChat = useCallback(() => {
    setIsChatOpen(false);
    flushRead();
  }, [flushRead]);

  const sendMessage = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message) return false;
      const clientMsgId = crypto.randomUUID();
      // 서버 echo는 같은 clientMsgId로 병합된다 (낙관적 업데이트).
      // 배치 기준은 아는 최신 ID — 이력 로딩 중이면 목록이 비어 있어 read-state의 latest를 쓰고,
      // 그것도 모르면 맨 뒤에 둔다 (0이면 이력이 도착했을 때 맨 위로 가버린다)
      setMessages((prev) => {
        const anchor = Math.max(getNewestServerId(prev) ?? 0, latestIdRef.current) || Number.MAX_SAFE_INTEGER;
        return [...prev, createPendingMessage(clientMsgId, message, currentUserIdRef.current ?? null, anchor)];
      });
      // 실제 전송은 대기열이 1건씩 (끊김·room 참가 전이면 다시 참가한 뒤 보낸다)
      outbox.enqueue({ clientMsgId, message });
      return true;
    },
    [outbox],
  );

  const value = useMemo<TeamChatContextValue>(
    () => ({
      messages,
      members,
      myUnreadCount,
      hasMoreOlder,
      isLoadingOlder,
      isHistoryLoaded: historyStatus === 'loaded',
      isChatOpen,
      openChat,
      closeChat,
      sendMessage,
      loadOlder,
      currentUserId,
    }),
    [
      messages,
      members,
      myUnreadCount,
      hasMoreOlder,
      isLoadingOlder,
      historyStatus,
      isChatOpen,
      openChat,
      closeChat,
      sendMessage,
      loadOlder,
      currentUserId,
    ],
  );

  return <TeamChatContext.Provider value={value}>{children}</TeamChatContext.Provider>;
}

/**
 * 팀 채팅 Context 사용 훅 — TeamChatProvider 내부에서만 사용 가능
 */
export function useTeamChatContext(): TeamChatContextValue {
  const context = useContext(TeamChatContext);
  if (!context) {
    throw new Error('useTeamChatContext must be used within a TeamChatProvider (teams/[teamId] layout).');
  }
  return context;
}
