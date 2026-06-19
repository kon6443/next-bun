'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { CloseIcon, SendIcon } from '@/app/components/Icons';
import type { TeamSocket, ChatReceivedPayload } from '@/types/socket';
import { TeamSocketEvents } from '@/types/socket';

/**
 * 팀 채팅 메시지 (클라이언트 로컬 상태)
 *
 * 현재는 저장 없이 실시간 브로드캐스트만 하므로 새로고침 시 사라진다.
 */
interface TeamChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isMine: boolean;
}

interface TeamChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** 메시지 전송 (Context의 emitChatMessage 주입). 생성된 clientMsgId 반환 */
  onSendMessage: (text: string) => string | null;
  socket?: TeamSocket | null;
  currentUserId?: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 팀 채팅 바텀시트
 *
 * - 하단에서 슬라이드업 (OnlineUsersModal과 동일 패턴, z-[100])
 * - 저장 없음: 로컬 state로만 메시지 유지
 * - self-filtering: 본인 메시지는 전송 시 로컬에 추가하고 서버 echo는 무시
 */
export function TeamChatPanel({ isOpen, onClose, onSendMessage, socket, currentUserId }: TeamChatPanelProps) {
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  /** 스크롤이 하단 근처인지 체크 */
  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  // 열릴 때 input 포커스 + 하단 스크롤
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      isNearBottomRef.current = true;
      setHasNewMessage(false);
    }
  }, [isOpen]);

  // 메시지 추가 시: 하단 근처면 자동 스크롤, 아니면 알림 표시
  useEffect(() => {
    if (messages.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    prevMessageCountRef.current = messages.length;
    if (!isOpen) return;

    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else {
      setHasNewMessage(true);
    }
  }, [isOpen, messages.length]);

  // 채팅 수신 (본인 메시지는 전송 시 로컬에 추가했으므로 skip)
  useEffect(() => {
    if (!socket) return;

    const handleChatReceived = (payload: ChatReceivedPayload) => {
      setMessages((prev) => {
        // 이미 추가된 메시지(본인 로컬 추가분 또는 중복 수신)는 무시 — clientMsgId 기반 dedup
        if (prev.some((m) => m.id === payload.messageId)) return prev;
        return [
          ...prev,
          {
            id: payload.messageId,
            sender: payload.userName,
            text: payload.message,
            timestamp: new Date(payload.timestamp).getTime(),
            isMine: currentUserId != null && payload.userId === currentUserId,
          },
        ];
      });
    };

    socket.on(TeamSocketEvents.CHAT_RECEIVED, handleChatReceived);
    return () => {
      socket.off(TeamSocketEvents.CHAT_RECEIVED, handleChatReceived);
    };
  }, [socket, currentUserId]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const clientMsgId = onSendMessage(text);
    if (!clientMsgId) return;

    // 서버 echo는 동일 clientMsgId로 dedup되므로 로컬에 즉시 추가 (낙관적 업데이트)
    setMessages((prev) => [
      ...prev,
      { id: clientMsgId, sender: '나', text, timestamp: Date.now(), isMine: true },
    ]);
    setInput('');
    inputRef.current?.focus();
  }, [input, onSendMessage]);

  const handleScroll = useCallback(() => {
    isNearBottomRef.current = checkNearBottom();
    if (isNearBottomRef.current) setHasNewMessage(false);
  }, [checkNearBottom]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setHasNewMessage(false);
    isNearBottomRef.current = true;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-slate-500">
                      아직 메시지가 없습니다. 첫 메시지를 보내보세요!
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'}`}
                    >
                      {!msg.isMine && (
                        <span className="mb-0.5 text-xs font-medium text-cyan-400">{msg.sender}</span>
                      )}
                      <div
                        className={`max-w-[75%] break-words rounded-2xl px-3 py-2 text-sm ${
                          msg.isMine ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <span className="mt-0.5 text-[10px] text-slate-500">{formatTime(msg.timestamp)}</span>
                    </div>
                  ))
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
            <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="메시지 입력..."
                maxLength={200}
                className="flex-1 rounded-full border border-slate-600/50 bg-slate-800 px-4 py-2 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
                style={{ fontSize: '16px' }}
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
    </>
  );
}
