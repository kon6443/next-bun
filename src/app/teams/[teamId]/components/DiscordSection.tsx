'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { CheckIcon, RefreshIcon, DiscordIcon } from '@/app/components/Icons';
import { ConfirmModal } from '@/app/components/ConfirmModal';
import type { DiscordStatusResponse } from '@/services/teamService';

type DiscordSectionProps = {
  discordStatus: DiscordStatusResponse | null;
  isLoading: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  onSaveWebhook: (webhookUrl: string) => Promise<void>;
  onDeleteWebhook: () => void;
  showDeleteConfirm: boolean;
  onConfirmDelete: () => Promise<void>;
  onCancelDelete: () => void;
  onRefreshStatus: () => Promise<void>;
};

export function DiscordSection({
  discordStatus,
  isLoading,
  isSaving,
  isDeleting,
  onSaveWebhook,
  onDeleteWebhook,
  showDeleteConfirm,
  onConfirmDelete,
  onCancelDelete,
  onRefreshStatus,
}: DiscordSectionProps) {
  const [webhookUrl, setWebhookUrl] = useState('');

  const handleSubmit = async () => {
    if (!webhookUrl.trim()) {
      toast.error('Webhook URL을 입력해주세요.');
      return;
    }
    await onSaveWebhook(webhookUrl.trim());
    setWebhookUrl('');
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      toast.success('URL이 클립보드에 복사되었습니다.');
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-dashed border-white/20 px-6 py-10 text-center text-slate-400">
        디스코드 연동 상태를 불러오는 중...
      </div>
    );
  }

  // 연동 완료 상태
  if (discordStatus?.isLinked && discordStatus.webhookUrl) {
    return (
      <>
        <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
              <CheckIcon className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-400">디스코드 연동 완료</p>
              <p className="text-xs text-slate-400">팀 알림이 디스코드 채널로 전송됩니다.</p>
            </div>
          </div>
          <div className="mb-4 rounded-lg border border-white/5 bg-slate-900/50 p-3">
            <p className="text-xs text-slate-500 mb-1">Webhook URL</p>
            <p className="text-xs font-mono text-slate-300 break-all">
              {discordStatus.webhookUrl.length > 60
                ? `${discordStatus.webhookUrl.slice(0, 60)}...`
                : discordStatus.webhookUrl}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleCopyUrl(discordStatus.webhookUrl!)}
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
            >
              URL 복사
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
              onClick={onDeleteWebhook}
              disabled={isDeleting}
              className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {isDeleting ? '해제 중...' : '연동 해제'}
            </button>
          </div>
        </div>
        <ConfirmModal
          isOpen={showDeleteConfirm}
          onClose={onCancelDelete}
          onConfirm={onConfirmDelete}
          title="디스코드 연동 해제"
          message="디스코드 연동을 해제하시겠습니까? 연동 해제 후에는 디스코드로 팀 알림을 받을 수 없습니다."
          confirmLabel="연동 해제"
          variant="danger"
          isLoading={isDeleting}
        />
      </>
    );
  }

  // 미연동 상태
  return (
    <div className="rounded-2xl border border-dashed border-white/20 px-6 py-8 text-center">
      <div className="flex justify-center mb-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/10">
          <DiscordIcon className="w-8 h-8 text-indigo-400" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-300 mb-2">디스코드 채널 연동</p>
      <p className="text-xs text-slate-400 mb-6">
        디스코드 채널의 Webhook URL을 입력하여
        <br />
        팀 알림을 받을 수 있습니다.
      </p>
      <div className="mb-4">
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://discord.com/api/webhooks/..."
          className="w-full rounded-lg border border-white/20 bg-slate-900/50 px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50 transition"
        />
      </div>
      <button
        onClick={handleSubmit}
        disabled={isSaving || !webhookUrl.trim()}
        className="w-full rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:brightness-110 disabled:opacity-50"
      >
        {isSaving ? '저장 중...' : '연동하기'}
      </button>
    </div>
  );
}
