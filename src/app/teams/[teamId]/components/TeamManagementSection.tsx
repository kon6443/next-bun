'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { SectionLabel, EmptyState } from '../../components';
import { ChevronUpIcon, ChevronDownIcon, UserIcon, ChartIcon, MailIcon, SendIcon } from '@/app/components/Icons';
import { getRoleMeta, CURRENT_USER_BADGE_CLASSNAME } from '@/app/config/roleConfig';
import { formatFullDateTime } from '@/app/utils/taskUtils';
import { TelegramSection } from './TelegramSection';
import type { TeamUserResponse, TeamInviteResponse, TelegramStatusResponse } from '@/services/teamService';
import { cardStyles } from '@/styles/teams';

type TeamManagementSectionProps = {
  // 멤버 관련
  members: TeamUserResponse[];
  currentUserId?: number;

  // 통계 관련
  statsCards: Array<{
    label: string;
    value: string | number;
    helper: string;
    alert?: boolean;
    warning?: boolean;
  }>;

  // 초대 관련
  canManageInvites: boolean;
  invites: TeamInviteResponse[];

  // 텔레그램 관련
  telegramStatus: TelegramStatusResponse | null;
  isLoadingTelegram: boolean;
  isCreatingTelegramLink: boolean;
  isDeletingTelegramLink: boolean;
  onCreateTelegramLink: () => Promise<void>;
  onDeleteTelegramLink: () => Promise<void>;
  onRefreshTelegramStatus: () => Promise<void>;
};

// 탭 설정 타입
type TabKey = 'members' | 'stats' | 'invites' | 'telegram';

type TabConfig = {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
  count: number | null;
  visible: boolean;
};

// 날짜 포맷 헬퍼 함수
function formatMemberDate(date: Date) {
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function TeamManagementSection({
  members,
  currentUserId,
  statsCards,
  canManageInvites,
  invites,
  telegramStatus,
  isLoadingTelegram,
  isCreatingTelegramLink,
  isDeletingTelegramLink,
  onCreateTelegramLink,
  onDeleteTelegramLink,
  onRefreshTelegramStatus,
}: TeamManagementSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('stats');

  const handleCopyInviteLink = (link: string) => {
    navigator.clipboard.writeText(link).then(() => {
      toast.success('초대 링크가 클립보드에 복사되었습니다.');
    });
  };

  // 탭 설정
  const tabsConfig: TabConfig[] = [
    {
      key: 'members',
      label: '멤버',
      icon: <UserIcon className="w-3.5 h-3.5" />,
      count: members.length,
      visible: true,
    },
    {
      key: 'stats',
      label: '통계',
      icon: <ChartIcon className="w-3.5 h-3.5" />,
      count: null,
      visible: true,
    },
    {
      key: 'invites',
      label: '초대',
      icon: <MailIcon className="w-3.5 h-3.5" />,
      count: invites.length,
      visible: canManageInvites,
    },
    {
      key: 'telegram',
      label: '텔레그램',
      icon: <SendIcon className="w-3.5 h-3.5" />,
      count: null,
      visible: canManageInvites,
    },
  ];

  const visibleTabs = tabsConfig.filter(tab => tab.visible);

  return (
    <section className={`${cardStyles.section} p-4`}>
      {/* 컴팩트 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SectionLabel>Team Management</SectionLabel>
          <div className="flex items-center gap-2">
            {visibleTabs.map(tab => (
              <span key={tab.key} className="flex items-center gap-1 text-xs text-slate-500" title={tab.label}>
                {tab.icon}
                {tab.count !== null && tab.count}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => setIsExpanded(v => !v)}
          className="p-2 rounded-lg hover:bg-white/5 transition text-slate-400 hover:text-slate-300"
          aria-label={isExpanded ? '접기' : '펼치기'}
        >
          {isExpanded ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* 펼쳐진 상태일 때만 표시 */}
      {isExpanded && (
        <>
          {/* 탭 버튼 */}
          <div className="mt-4 flex gap-1 rounded-xl border border-white/10 bg-slate-900/30 p-1">
            {visibleTabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${
                  activeTab === tab.key
                    ? 'bg-gradient-to-r from-indigo-500/20 to-sky-500/20 text-white border border-white/10'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                title={tab.label}
              >
                {tab.icon}
                {tab.count !== null && <span>{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* 멤버 탭 내용 */}
          {activeTab === 'members' && (
            <div className="mt-4">
              {members.length === 0 ? (
                <EmptyState message="멤버 정보를 불러오는 중..." />
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {members.map(member => {
                    const isCurrentUser = currentUserId === member.userId;
                    const roleMeta = getRoleMeta(member.role);

                    return (
                      <div key={member.userId} className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-lg font-semibold text-white">
                                {member.userName || `사용자 ${member.userId}`}
                              </p>
                              <span className={roleMeta.className}>{roleMeta.label}</span>
                              {isCurrentUser && <span className={CURRENT_USER_BADGE_CLASSNAME}>나</span>}
                            </div>
                            <p className="mt-2 text-xs text-slate-500">가입일: {formatMemberDate(member.joinedAt)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 통계 탭 내용 */}
          {activeTab === 'stats' && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-3">
                {statsCards.map(stat => (
                  <div
                    key={stat.label}
                    className={`rounded-2xl border p-3 ${
                      stat.alert
                        ? 'border-red-500/30 bg-red-500/10'
                        : stat.warning
                          ? 'border-orange-500/30 bg-orange-500/10'
                          : 'border-white/10 bg-slate-950/30'
                    }`}
                  >
                    <SectionLabel spacing="tight" color="subtle">
                      {stat.label}
                    </SectionLabel>
                    <p
                      className={`mt-3 text-3xl font-bold ${
                        stat.alert ? 'text-red-400' : stat.warning ? 'text-orange-400' : 'text-white'
                      }`}
                    >
                      {stat.value}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{stat.helper}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 초대 링크 탭 내용 */}
          {activeTab === 'invites' && canManageInvites && (
            <div className="mt-4">
              {invites.length === 0 ? (
                <EmptyState message="생성된 초대 링크가 없습니다." />
              ) : (
                <div className="grid gap-4">
                  {invites.map(invite => {
                    const isExpired = new Date(invite.endAt) < new Date();
                    const isMaxReached = invite.usageCurCnt >= invite.usageMaxCnt;
                    const isActive = invite.actStatus === 1 && !isExpired && !isMaxReached;

                    // 초대 링크 URL 생성
                    const inviteUrl = `${
                      typeof window !== 'undefined' ? window.location.origin : ''
                    }/teams/invite/accept?token=${encodeURIComponent(invite.token)}`;

                    return (
                      <div
                        key={invite.invId}
                        className={`rounded-2xl border p-4 ${
                          isActive
                            ? 'border-white/10 bg-slate-950/30'
                            : 'border-slate-700/50 bg-slate-950/10 opacity-60'
                        }`}
                      >
                        <div className="flex flex-col gap-3">
                          <div>
                            <div className="mb-2 flex items-center gap-2">
                              <p className="text-sm font-semibold text-slate-300">초대 링크 #{invite.invId}</p>
                              {isActive ? (
                                <span className="rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-400">
                                  활성
                                </span>
                              ) : (
                                <span className="rounded-full border border-slate-500/30 bg-slate-500/20 px-2 py-0.5 text-xs font-semibold text-slate-400">
                                  비활성
                                </span>
                              )}
                            </div>
                            <div className="space-y-1 text-sm text-slate-400">
                              <p>
                                사용 횟수: {invite.usageCurCnt} / {invite.usageMaxCnt}
                              </p>
                              <p>만료일: {formatFullDateTime(new Date(invite.endAt))}</p>
                              <p>생성일: {formatFullDateTime(new Date(invite.crtdAt))}</p>
                            </div>
                            {isActive && (
                              <div className="mt-3 rounded-lg border border-white/5 bg-slate-900/50 p-3">
                                <p className="mb-1 text-xs text-slate-500">초대 링크:</p>
                                <p className="break-all font-mono text-xs text-slate-300">{inviteUrl}</p>
                              </div>
                            )}
                          </div>
                          {isActive && (
                            <button
                              onClick={() => handleCopyInviteLink(inviteUrl)}
                              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:bg-white/10"
                            >
                              링크 복사
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 텔레그램 탭 내용 */}
          {activeTab === 'telegram' && (
            <div className="mt-4">
              <TelegramSection
                telegramStatus={telegramStatus}
                isLoading={isLoadingTelegram}
                isCreatingLink={isCreatingTelegramLink}
                isDeletingLink={isDeletingTelegramLink}
                onCreateLink={onCreateTelegramLink}
                onDeleteLink={onDeleteTelegramLink}
                onRefreshStatus={onRefreshTelegramStatus}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
