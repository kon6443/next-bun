'use client';

import { useState, useMemo, useCallback } from 'react';
import { CloseIcon } from '@/app/components/Icons';
import { UserAvatar } from '@/app/components/UserAvatar';
import type { OnlineUserInfo } from '@/types/socket';

type OnlineUsersProps = {
  users: OnlineUserInfo[];
  currentUserId?: number;
  /** 모달 열림/닫힘 상태 변경 콜백 (FAB 숨김 처리용) */
  onModalOpenChange?: (isOpen: boolean) => void;
};

/**
 * 온라인 유저 컴포넌트
 *
 * 팀 보드 상단에 표시되는 온라인 유저 미니뷰입니다.
 * 클릭하면 바텀시트 모달로 전체 목록을 표시합니다.
 *
 * @features
 * - 미니뷰: 아바타 스택 (최대 4개) + 총 인원 수
 * - 바텀시트 모달: 전체 유저 목록 (스크롤 가능)
 * - 현재 유저 강조 표시
 * - 다중 탭 접속 시 배지 표시
 */
export function OnlineUsers({ users, currentUserId, onModalOpenChange }: OnlineUsersProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 현재 유저를 맨 앞으로, 나머지는 이름순 정렬
  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.userId === currentUserId) return -1;
      if (b.userId === currentUserId) return 1;
      return a.userName.localeCompare(b.userName);
    });
  }, [users, currentUserId]);

  // 미리보기용 유저 (최대 4명)
  const previewUsers = sortedUsers.slice(0, 4);
  const remainingCount = sortedUsers.length - previewUsers.length;

  const handleOpenModal = useCallback(() => {
    setIsModalOpen(true);
    onModalOpenChange?.(true);
  }, [onModalOpenChange]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    onModalOpenChange?.(false);
  }, [onModalOpenChange]);

  if (sortedUsers.length === 0) {
    return null;
  }

  return (
    <>
      {/* 미니뷰 */}
      <OnlineUsersMiniView
        previewUsers={previewUsers}
        remainingCount={remainingCount}
        totalCount={sortedUsers.length}
        currentUserId={currentUserId}
        onClick={handleOpenModal}
      />

      {/* 바텀시트 모달 */}
      <OnlineUsersModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        users={sortedUsers}
        currentUserId={currentUserId}
      />
    </>
  );
}

// ===== 서브 컴포넌트 =====

/**
 * 온라인 표시 인디케이터 (펄스 애니메이션)
 */
function OnlineIndicator({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className={`relative flex ${sizeClass}`}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className={`relative inline-flex rounded-full ${sizeClass} bg-emerald-500`} />
    </span>
  );
}

/**
 * 미니뷰 컴포넌트
 */
function OnlineUsersMiniView({
  previewUsers,
  remainingCount,
  totalCount,
  currentUserId,
  onClick,
}: {
  previewUsers: OnlineUserInfo[];
  remainingCount: number;
  totalCount: number;
  currentUserId?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all duration-200 group"
      aria-label="온라인 유저 목록 보기"
    >
      <OnlineIndicator size="sm" />

      {/* 아바타 스택 */}
      <div className="flex -space-x-2">
        {previewUsers.map((user, index) => (
          <UserAvatar
            key={user.userId}
            userName={user.userName}
            isCurrentUser={user.userId === currentUserId}
            connectionCount={user.connectionCount}
            size="sm"
            style={{ zIndex: previewUsers.length - index }}
          />
        ))}
        {remainingCount > 0 && (
          <div
            className="relative flex items-center justify-center w-7 h-7 rounded-full bg-slate-700 border-2 border-slate-800 text-[10px] font-semibold text-slate-300"
            style={{ zIndex: 0 }}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {/* 인원 수 */}
      <span className="text-xs font-medium text-emerald-400 group-hover:text-emerald-300">
        {totalCount}명
      </span>
    </button>
  );
}

/**
 * 유저 목록 아이템
 */
function OnlineUserListItem({
  user,
  isCurrentUser,
}: {
  user: OnlineUserInfo;
  isCurrentUser: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${
        isCurrentUser
          ? 'bg-emerald-500/10 border border-emerald-500/20'
          : 'hover:bg-white/5'
      }`}
    >
      <UserAvatar
        userName={user.userName}
        isCurrentUser={isCurrentUser}
        connectionCount={user.connectionCount}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-200 truncate">
          {user.userName}
          {isCurrentUser && (
            <span className="ml-2 text-xs text-emerald-400 font-normal">(나)</span>
          )}
        </p>
        {user.connectionCount > 1 && (
          <p className="text-xs text-slate-500">
            {user.connectionCount}개 기기에서 접속 중
          </p>
        )}
      </div>
      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        온라인
      </span>
    </div>
  );
}

/**
 * 바텀시트 모달
 *
 * z-index: 100으로 설정하여 하단 네비게이션 바(z-50)보다 위에 표시됩니다.
 * safe-area-inset-bottom을 고려하여 하단 패딩을 추가합니다.
 */
function OnlineUsersModal({
  isOpen,
  onClose,
  users,
  currentUserId,
}: {
  isOpen: boolean;
  onClose: () => void;
  users: OnlineUserInfo[];
  currentUserId?: number;
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* 오버레이 - z-index를 100으로 높여서 BottomNavBar(z-50) 위에 표시 */}
      <div
        className="fixed inset-0 z-[100] bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 바텀시트 */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] animate-[slideUp_0.3s_ease-out]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="online-users-title"
      >
        <div className="mx-auto max-w-lg">
          <div className="rounded-t-3xl border border-white/10 border-b-0 bg-slate-900 shadow-2xl">
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 pb-3">
              <div className="flex items-center gap-3">
                <OnlineIndicator size="md" />
                <h3 id="online-users-title" className="text-lg font-bold text-white">
                  온라인 멤버
                  <span className="ml-2 text-emerald-400">({users.length})</span>
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-full transition"
                aria-label="닫기"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* 유저 목록 - 하단 네비게이션 바 높이(약 80px) + safe-area 고려 */}
            <div className="px-4 pb-24 max-h-[60vh] overflow-y-auto">
              <div className="space-y-1">
                {users.map(user => (
                  <OnlineUserListItem
                    key={user.userId}
                    user={user}
                    isCurrentUser={user.userId === currentUserId}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}
