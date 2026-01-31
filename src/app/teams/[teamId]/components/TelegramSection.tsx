'use client';

import toast from 'react-hot-toast';
import { ClockIcon, SendIcon, RefreshIcon, CheckIcon } from '@/app/components/Icons';
import { formatFullDateTime } from '@/app/utils/taskUtils';
import type { TelegramStatusResponse } from '@/services/teamService';

type TelegramSectionProps = {
  telegramStatus: TelegramStatusResponse | null;
  isLoading: boolean;
  isCreatingLink: boolean;
  isDeletingLink: boolean;
  onCreateLink: () => Promise<void>;
  onDeleteLink: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
};

export function TelegramSection({
  telegramStatus,
  isLoading,
  isCreatingLink,
  isDeletingLink,
  onCreateLink,
  onDeleteLink,
  onRefreshStatus,
}: TelegramSectionProps) {
  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      toast.success('링크가 클립보드에 복사되었습니다.');
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 px-6 py-10 text-center text-slate-400">
        텔레그램 연동 상태를 불러오는 중...
      </div>
    );
  }

  // 연동 완료 상태
  if (telegramStatus?.isLinked) {
    return (
      <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
            <CheckIcon className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-400">텔레그램 연동 완료</p>
            <p className="text-xs text-slate-400">팀 알림이 텔레그램 그룹으로 전송됩니다.</p>
          </div>
        </div>
        <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-500 mb-1">Chat ID</p>
          <p className="text-sm font-mono text-slate-300">{telegramStatus.chatId}</p>
        </div>
        <button
          onClick={onDeleteLink}
          disabled={isDeletingLink}
          className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
        >
          {isDeletingLink ? '해제 중...' : '연동 해제'}
        </button>
      </div>
    );
  }

  // 대기 중 상태 (연동 링크 생성됨)
  if (telegramStatus?.pendingLink) {
    return (
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20">
            <ClockIcon className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-yellow-400">연동 대기 중</p>
            <p className="text-xs text-slate-400">아래 링크를 클릭하여 텔레그램 그룹에 봇을 추가해주세요.</p>
          </div>
        </div>
        <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/50 p-3">
          <p className="text-xs text-slate-500 mb-1">연동 링크</p>
          <a
            href={telegramStatus.pendingLink.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="block break-all text-xs font-mono text-sky-400 hover:text-sky-300 underline"
          >
            {telegramStatus.pendingLink.deepLink}
          </a>
        </div>
        <div className="mb-4 text-xs text-slate-400">
          <span className="text-slate-500">만료:</span>{' '}
          {formatFullDateTime(new Date(telegramStatus.pendingLink.endAt))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleCopyLink(telegramStatus.pendingLink!.deepLink)}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
          >
            링크 복사
          </button>
          <button
            onClick={onRefreshStatus}
            disabled={isLoading}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-50"
            title="상태 새로고침"
          >
            <RefreshIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-3">
          <button
            onClick={onCreateLink}
            disabled={isCreatingLink}
            className="w-full rounded-lg border border-slate-500/30 bg-slate-500/10 px-4 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-500/20 disabled:opacity-50"
          >
            {isCreatingLink ? '생성 중...' : '새 링크 생성'}
          </button>
        </div>
      </div>
    );
  }

  // 미연동 상태
  return (
    <div className="rounded-2xl border border-dashed border-white/20 px-6 py-10 text-center">
      <div className="flex justify-center mb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/10">
          <SendIcon className="w-8 h-8 text-sky-400" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-300 mb-2">텔레그램 그룹 연동</p>
      <p className="text-xs text-slate-400 mb-6">
        텔레그램 그룹과 연동하여
        <br />
        팀 알림을 받을 수 있습니다.
      </p>
      <button
        onClick={onCreateLink}
        disabled={isCreatingLink}
        className="rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50"
      >
        {isCreatingLink ? '생성 중...' : '연동 링크 생성'}
      </button>
    </div>
  );
}
