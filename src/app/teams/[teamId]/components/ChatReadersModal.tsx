'use client';

import { CloseIcon } from '@/app/components/Icons';
import { useDialog } from '@/app/hooks/useDialog';
import { UserAvatar } from '@/app/components/UserAvatar';
import type { ChatMemberReadState } from '@/services/teamService';

interface ChatReadersModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** getChatReaders 결과 (보낸 사람 제외) */
  readers: { read: ChatMemberReadState[]; unread: ChatMemberReadState[] } | null;
  currentUserId?: number;
}

/**
 * 메시지 읽음/안읽음 명단 바텀시트 (OnlineUsersModal과 같은 패턴)
 *
 * 채팅 패널(z-[100]) 위에 겹쳐 뜨도록 z-[110]을 쓴다.
 */
export function ChatReadersModal({ isOpen, onClose, readers, currentUserId }: ChatReadersModalProps) {
  const dialogRef = useDialog<HTMLDivElement>(isOpen && Boolean(readers), onClose);
  if (!isOpen || !readers) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-black/60" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="fixed bottom-0 left-0 right-0 z-[110] animate-[slideUp_0.3s_ease-out] focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-readers-title"
      >
        <div className="mx-auto max-w-lg">
          <div className="rounded-t-3xl border border-white/10 border-b-0 bg-slate-900 shadow-2xl">
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 id="chat-readers-title" className="text-lg font-bold text-white">
                읽음 확인
              </h3>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-full transition"
                aria-label="닫기"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] max-h-[60vh] overflow-y-auto space-y-4">
              <ReaderSection title="안 읽음" members={readers.unread} currentUserId={currentUserId} />
              <ReaderSection title="읽음" members={readers.read} currentUserId={currentUserId} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function ReaderSection({
  title,
  members,
  currentUserId,
}: {
  title: string;
  members: ChatMemberReadState[];
  currentUserId?: number;
}) {
  return (
    <section>
      <p className="mb-1 px-1 text-xs font-semibold text-slate-400">
        {title} <span className="text-slate-500">({members.length})</span>
      </p>
      {members.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-500">없음</p>
      ) : (
        <div className="space-y-1">
          {members.map((member) => {
            const isCurrentUser = member.userId === currentUserId;
            return (
              <div key={member.userId} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                <UserAvatar userName={member.userName} isCurrentUser={isCurrentUser} size="sm" />
                <p className="flex-1 min-w-0 truncate text-sm font-medium text-slate-200">
                  {member.userName}
                  {isCurrentUser && <span className="ml-2 text-xs text-emerald-400 font-normal">(나)</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
