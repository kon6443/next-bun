'use client';

import { Fragment, useState, useCallback, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { CloseIcon, SendIcon } from '@/app/components/Icons';
import { LoadingSpinnerSimple } from '@/app/teams/components';
import { baseInputStyles } from '@/app/teams/components/FormInput';
import {
  countUnreadReaders,
  formatChatDateDivider,
  getChatReaders,
  isDifferentLocalDay,
  type TeamChatMessage,
} from '@/app/utils/teamChatUtils';
import { useTeamChatContext } from '../contexts';
import { ChatUnreadCount } from './ChatUnreadCount';
import { ChatReadersModal } from './ChatReadersModal';

/** 메시지 최대 길이 (백엔드 @MaxLength(4000), D-013) */
const CHAT_MAX_LENGTH = 4000;
/** 입력창 최대 높이 — 5줄(16px × line-height 1.5 × 5 + 세로 padding 16px), 넘으면 내부 스크롤 (D-022) */
const TEXTAREA_MAX_HEIGHT_PX = 136;
/** 이 높이 안으로 위로 스크롤하면 이전 메시지를 불러온다 */
const LOAD_OLDER_THRESHOLD_PX = 40;

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 팀 채팅 바텀시트
 *
 * - 하단에서 슬라이드업 (OnlineUsersModal과 동일 패턴, z-[100])
 * - 상태(메시지·읽음·이력)는 TeamChatContext가 갖고, 이 컴포넌트는 표시와 스크롤만 맡는다
 * - 위로 스크롤하면 이전 메시지를 불러오고, 불러온 만큼 스크롤 위치를 보정한다
 */
export function TeamChatPanel() {
  const {
    messages,
    members,
    hasMoreOlder,
    isLoadingOlder,
    isHistoryLoaded,
    isChatOpen: isOpen,
    closeChat: onClose,
    sendMessage,
    loadOlder,
    currentUserId,
  } = useTeamChatContext();

  const [input, setInput] = useState('');
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [readersTarget, setReadersTarget] = useState<TeamChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isNearBottomRef = useRef(true);
  const lastMessageKeyRef = useRef<string | undefined>(undefined);
  /** 이전 페이지를 앞에 붙이기 직전의 스크롤 상태 (위치 보정용) */
  const prependAnchorRef = useRef<{ firstKey: string | undefined; scrollHeight: number; scrollTop: number } | null>(
    null,
  );

  /** 스크롤이 하단 근처인지 체크 */
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setHasNewMessage(false);
    isNearBottomRef.current = true;
  }, []);

  // 열릴 때 input 포커스 + 하단 스크롤
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
      scrollToBottom();
    } else {
      setReadersTarget(null);
    }
  }, [isOpen, scrollToBottom]);

  // 첫 이력이 들어오면 하단으로
  useEffect(() => {
    if (isOpen && isHistoryLoaded) scrollToBottom();
  }, [isOpen, isHistoryLoaded, scrollToBottom]);

  // 이전 페이지를 앞에 붙였으면 보던 위치를 유지한다 (paint 전에 보정)
  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    const el = scrollRef.current;
    if (!anchor || !el || messages[0]?.key === anchor.firstKey) return;
    el.scrollTop = el.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
    prependAnchorRef.current = null;
  }, [messages]);

  // 이전 페이지 조회가 끝났는데 보정이 안 쓰였으면(실패·0건) 기준점을 버린다
  useEffect(() => {
    if (!isLoadingOlder) prependAnchorRef.current = null;
  }, [isLoadingOlder]);

  // 맨 아래에 메시지가 추가되면: 하단 근처이거나 내가 보낸 메시지면 자동 스크롤, 아니면 알림 표시
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastKey = last?.key;
    if (lastKey === lastMessageKeyRef.current) return;
    lastMessageKeyRef.current = lastKey;
    if (!isOpen || !last) return;

    if ((isNearBottomRef.current || last.isMine) && scrollRef.current) {
      scrollToBottom();
    } else {
      setHasNewMessage(true);
    }
  }, [isOpen, messages, scrollToBottom]);

  // 입력창 자동 높이
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT_PX)}px`;
  }, [input, isOpen]);

  const handleSend = useCallback(() => {
    if (!sendMessage(input)) return;
    setInput('');
    inputRef.current?.focus();
  }, [input, sendMessage]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    isNearBottomRef.current = checkNearBottom();
    if (isNearBottomRef.current) setHasNewMessage(false);

    if (el && el.scrollTop < LOAD_OLDER_THRESHOLD_PX && isHistoryLoaded && hasMoreOlder && !isLoadingOlder) {
      prependAnchorRef.current = { firstKey: messages[0]?.key, scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
      void loadOlder();
    }
  }, [checkNearBottom, isHistoryLoaded, hasMoreOlder, isLoadingOlder, messages, loadOlder]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Enter 전송, Shift+Enter 줄바꿈 (한글 조합 중 Enter는 무시)
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [handleSend, onClose],
  );

  const readers = useMemo(
    () => (readersTarget ? getChatReaders(readersTarget, members) : null),
    [readersTarget, members],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 - BottomNavBar(z-50) 위에 표시 */}
      <div className="fixed inset-0 z-[100] bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* 바텀시트 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] animate-[slideUp_0.3s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-chat-title"
      >
        <div className="mx-auto max-w-lg">
          <div className="flex flex-col rounded-t-3xl border border-white/10 border-b-0 bg-slate-900 shadow-2xl">
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 id="team-chat-title" className="text-lg font-bold text-white">
                팀 채팅
              </h3>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-full transition"
                aria-label="닫기"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 메시지 목록 */}
            <div className="relative">
              <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="px-4 h-[40vh] overflow-y-auto space-y-2"
              >
                {(isLoadingOlder || (!isHistoryLoaded && messages.length === 0)) && (
                  <div className="flex justify-center pt-4" aria-label="메시지 불러오는 중">
                    <LoadingSpinnerSimple />
                  </div>
                )}

                {isHistoryLoaded && messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-slate-500">
                      아직 메시지가 없습니다. 첫 메시지를 보내보세요!
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const previous = messages[index - 1];
                    const showDateDivider = !previous || isDifferentLocalDay(previous.timestamp, msg.timestamp);
                    return (
                      <Fragment key={msg.key}>
                        {showDateDivider && <ChatDateDivider timestamp={msg.timestamp} />}
                        <ChatMessageItem
                          message={msg}
                          unreadCount={countUnreadReaders(msg, members)}
                          onShowReaders={() => setReadersTarget(msg)}
                        />
                      </Fragment>
                    );
                  })
                )}
              </div>

              {hasNewMessage && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-pulse rounded-full bg-cyan-600 px-3 py-1 text-xs text-white shadow-lg"
                >
                  ↓ 새 메시지
                </button>
              )}
            </div>

            {/* 입력 영역 - 하단 safe-area 고려 */}
            <div className="flex items-end gap-2 border-t border-white/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지 입력..."
                maxLength={CHAT_MAX_LENGTH}
                aria-label="메시지 입력 (Shift+Enter 줄바꿈)"
                className={`${baseInputStyles} flex-1 resize-none overflow-y-auto px-4 py-2 leading-normal`}
                style={{ fontSize: '16px', maxHeight: TEXTAREA_MAX_HEIGHT_PX }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex shrink-0 items-center justify-center rounded-full bg-cyan-600 p-2.5 text-white transition-colors hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500"
                aria-label="전송"
              >
                <SendIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ChatReadersModal
        isOpen={readersTarget !== null}
        onClose={() => setReadersTarget(null)}
        readers={readers}
        currentUserId={currentUserId}
      />
    </>
  );
}

/** 날짜가 바뀌는 지점의 가운데 구분선 (로컬 날짜) */
function ChatDateDivider({ timestamp }: { timestamp: number }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator">
      <div className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] text-slate-500">{formatChatDateDivider(timestamp)}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

/** 메시지 한 개 — 말풍선 옆에 [안 읽은 인원 / 시간(또는 전송 실패)]을 세로로 둔다 (D-022) */
function ChatMessageItem({
  message: msg,
  unreadCount,
  onShowReaders,
}: {
  message: TeamChatMessage;
  unreadCount: number | null;
  onShowReaders: () => void;
}) {
  return (
    <div className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}>
      {!msg.isMine && <span className="mb-0.5 text-xs font-medium text-cyan-400">{msg.sender}</span>}
      <div className={`flex max-w-[85%] items-end gap-1.5 ${msg.isMine ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className={`min-w-0 whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
            msg.isMine ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'
          }`}
        >
          {msg.text}
        </div>
        <div className={`flex shrink-0 flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}>
          <ChatUnreadCount count={unreadCount} onClick={onShowReaders} />
          {msg.failed ? (
            <span className="text-[10px] text-red-400">전송 실패</span>
          ) : (
            <span className="text-[10px] text-slate-500">{formatTime(msg.timestamp)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
