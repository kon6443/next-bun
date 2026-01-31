'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { CloseIcon } from '@/app/components/Icons';

type InviteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreateInvite: (expiresInDays: number, usageMaxCnt?: number) => Promise<void>;
  isCreating: boolean;
  createdInviteLink: string | null;
  onClearCreatedLink: () => void;
};

export function InviteModal({
  isOpen,
  onClose,
  onCreateInvite,
  isCreating,
  createdInviteLink,
  onClearCreatedLink,
}: InviteModalProps) {
  if (!isOpen) return null;

  const handleClose = () => {
    onClearCreatedLink();
    onClose();
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      toast.success('초대 링크가 클립보드에 복사되었습니다.');
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-4">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200"
          aria-label="닫기"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h3 className="mb-4 text-xl font-bold text-white">초대 링크 생성</h3>

        {createdInviteLink ? (
          <div>
            <p className="mb-4 text-sm text-slate-400">초대 링크가 생성되었습니다!</p>
            <div className="mb-4 rounded-lg bg-slate-950/50 border border-white/5 p-3">
              <p className="mb-2 text-xs text-slate-500">초대 링크:</p>
              <p className="break-all text-xs text-slate-300 font-mono">{createdInviteLink}</p>
            </div>
            <button
              onClick={() => handleCopyLink(createdInviteLink)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
            >
              링크 복사
            </button>
            <button
              onClick={handleClose}
              className="mt-3 w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
            >
              닫기
            </button>
          </div>
        ) : (
          <InviteCreateForm
            onSubmit={onCreateInvite}
            isSubmitting={isCreating}
            onCancel={handleClose}
          />
        )}
      </div>
    </div>
  );
}

// 초대 링크 생성 폼 컴포넌트
function InviteCreateForm({
  onSubmit,
  isSubmitting,
  onCancel,
}: {
  onSubmit: (expiresInDays: number, usageMaxCnt?: number) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}) {
  const [expiresInDays, setExpiresInDays] = useState<number>(3);
  const [usageMaxCnt, setUsageMaxCnt] = useState<number | ''>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const usageMaxCntValue = usageMaxCnt === '' ? undefined : Number(usageMaxCnt);
    await onSubmit(expiresInDays, usageMaxCntValue);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-2 block text-xs font-semibold text-slate-300">만료일 (최대 3일)</label>
        <select
          value={expiresInDays}
          onChange={e => setExpiresInDays(Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none"
        >
          {Array.from({ length: 3 }, (_, i) => i + 1).map(days => (
            <option key={days} value={days}>
              {days}일 후 (23:59 만료)
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">일 단위로만 선택할 수 있어요. (1~3일)</p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold text-slate-300">최대 사용 횟수 (선택사항)</label>
        <input
          type="number"
          value={usageMaxCnt}
          onChange={e => setUsageMaxCnt(e.target.value === '' ? '' : Number(e.target.value))}
          min={1}
          className="w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-200 focus:border-white/20 focus:outline-none"
          placeholder="최대 사용 횟수"
        />
        <p className="mt-1 text-xs text-slate-500">최대 사용 횟수를 지정하지 않으면 기본값이 적용됩니다.</p>
      </div>

      <div className="flex gap-2 pt-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? '생성 중...' : '생성하기'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}
