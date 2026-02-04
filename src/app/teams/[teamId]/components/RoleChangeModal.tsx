'use client';

import { useState } from 'react';
import { CloseIcon } from '@/app/components/Icons';
import { ROLES, getRoleMeta } from '@/app/config/roleConfig';

type RoleChangeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newRole: 'MANAGER' | 'MEMBER') => Promise<void>;
  isSubmitting: boolean;
  targetUser: {
    userId: number;
    userName: string | null;
    currentRole: string;
  } | null;
  /** 요청자의 역할 (변경 가능한 역할 목록 결정용) */
  actorRole: string;
};

/**
 * 역할 변경 모달
 * - MASTER: MANAGER, MEMBER 중 선택 가능
 * - MANAGER: MANAGER로만 승격 가능 (MEMBER 대상)
 */
export function RoleChangeModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  targetUser,
  actorRole,
}: RoleChangeModalProps) {
  const [selectedRole, setSelectedRole] = useState<'MANAGER' | 'MEMBER' | null>(null);

  if (!isOpen || !targetUser) return null;

  const handleClose = () => {
    setSelectedRole(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    await onSubmit(selectedRole);
    setSelectedRole(null);
  };

  // 변경 가능한 역할 목록 계산
  const getAvailableRoles = (): Array<'MANAGER' | 'MEMBER'> => {
    const actorRoleUpper = actorRole.toUpperCase();
    const targetCurrentRoleUpper = targetUser.currentRole.toUpperCase();

    // MASTER는 모든 역할로 변경 가능 (현재 역할 제외)
    if (actorRoleUpper === 'MASTER') {
      return (['MANAGER', 'MEMBER'] as const).filter(r => r !== targetCurrentRoleUpper);
    }

    // MANAGER는 MEMBER를 MANAGER로만 승격 가능
    if (actorRoleUpper === 'MANAGER' && targetCurrentRoleUpper === 'MEMBER') {
      return ['MANAGER'];
    }

    return [];
  };

  const availableRoles = getAvailableRoles();
  const currentRoleMeta = getRoleMeta(targetUser.currentRole);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-200"
          aria-label="닫기"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        <h3 className="mb-4 text-xl font-bold text-white">역할 변경</h3>

        {/* 대상 사용자 정보 */}
        <div className="mb-6 rounded-xl border border-white/10 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-white">
                {targetUser.userName || `사용자 ${targetUser.userId}`}
              </p>
              <p className="mt-1 text-sm text-slate-400">현재 역할</p>
            </div>
            <span className={currentRoleMeta.className}>{currentRoleMeta.label}</span>
          </div>
        </div>

        {availableRoles.length === 0 ? (
          <div className="text-center">
            <p className="mb-4 text-sm text-slate-400">
              이 사용자의 역할을 변경할 수 없습니다.
            </p>
            <button
              onClick={handleClose}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
            >
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-3 block text-sm font-semibold text-slate-300">
                변경할 역할 선택
              </label>
              <div className="grid gap-2">
                {availableRoles.map(role => {
                  const roleMeta = ROLES[role];
                  const isSelected = selectedRole === role;

                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={`flex items-center justify-between rounded-xl border p-4 transition ${
                        isSelected
                          ? 'border-indigo-500/50 bg-indigo-500/10'
                          : 'border-white/10 bg-slate-950/30 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-3 w-3 rounded-full border-2 transition ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-500'
                              : 'border-slate-500'
                          }`}
                        />
                        <span className="text-sm font-medium text-white">{roleMeta.label}</span>
                      </div>
                      <span className={roleMeta.className}>{roleMeta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 역할 변경 설명 */}
            {selectedRole && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
                <p className="text-xs text-amber-300">
                  {targetUser.userName || `사용자 ${targetUser.userId}`}님의 역할이{' '}
                  <strong>{currentRoleMeta.label}</strong>에서{' '}
                  <strong>{ROLES[selectedRole].label}</strong>로 변경됩니다.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !selectedRole}
                className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '변경 중...' : '역할 변경'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
