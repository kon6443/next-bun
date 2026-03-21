'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
}

const SYSTEM_MESSAGES: ChatMessage[] = [
  {
    id: 'sys-1',
    sender: '시스템',
    text: '평화로운 강가에 오신 것을 환영합니다!',
    timestamp: Date.now() - 60000,
    isSystem: true,
  },
  {
    id: 'sys-2',
    sender: '시스템',
    text: '채팅 기능은 추후 멀티플레이어 업데이트에서 활성화됩니다.',
    timestamp: Date.now() - 30000,
    isSystem: true,
  },
];

export default function ChatPanel({ isOpen, onClose, onSendMessage }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(SYSTEM_MESSAGES);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 채팅 열릴 때 input 자동 포커스
  useEffect(() => {
    if (isOpen) {
      // 다음 프레임에 포커스 (렌더 완료 후)
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [isOpen]);

  // 메시지 추가 시 스크롤
  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, messages.length]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    const newMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      sender: '나',
      text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    onSendMessage(text);

    // 전송 후 input에 포커스 유지
    inputRef.current?.focus();
  }, [input, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 채팅 input 안에서는 게임 키 전파 방지
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) {
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
    <div
      className="absolute bottom-16 left-3 z-30 w-72 max-h-80 flex flex-col
                 bg-slate-900/85 border border-slate-700/50 rounded-xl overflow-hidden"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <span className="text-xs text-slate-300 font-medium">채팅</span>
        <span className="text-[10px] text-slate-600">Esc로 닫기</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-game p-2 space-y-1.5 min-h-[120px] max-h-[200px]">
        {messages.map((msg) => (
          <div key={msg.id} className={msg.isSystem ? 'text-center' : ''}>
            {msg.isSystem ? (
              <span className="text-[10px] text-slate-500 italic">{msg.text}</span>
            ) : (
              <div>
                <span className="text-[10px] text-cyan-400 font-medium">{msg.sender}</span>
                <span className="text-[10px] text-slate-400 ml-1.5">{msg.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 p-2 border-t border-slate-700/50">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지 입력..."
          className="flex-1 bg-slate-800/80 border border-slate-600/50 rounded-lg px-2.5 py-1.5
                     text-xs text-slate-200 placeholder:text-slate-500
                     focus:outline-none focus:border-cyan-500/50"
          maxLength={200}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500
                     text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors"
        >
          전송
        </button>
      </div>
    </div>
  );
}
