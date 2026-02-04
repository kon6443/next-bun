'use client';

import { useMemo } from 'react';

/**
 * 아바타 색상 팔레트 - 세련된 그라데이션 조합
 *
 * @note iOS Safari 성능 최적화
 * - backdrop-filter: blur() 사용 금지 (심각한 성능 저하)
 * - filter: blur() 최소화 (box-shadow로 대체)
 * - 참고: /docs/assistant_rules_ui.md
 */
const AVATAR_THEMES = [
  {
    bg: 'from-violet-600 via-purple-500 to-fuchsia-500',
    ring: 'ring-violet-400/30',
    shadow: 'shadow-[0_0_12px_rgba(139,92,246,0.5)]', // violet glow
  },
  {
    bg: 'from-blue-600 via-sky-500 to-cyan-400',
    ring: 'ring-blue-400/30',
    shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.5)]', // blue glow
  },
  {
    bg: 'from-emerald-600 via-teal-500 to-cyan-500',
    ring: 'ring-emerald-400/30',
    shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.5)]', // emerald glow
  },
  {
    bg: 'from-orange-500 via-amber-500 to-yellow-400',
    ring: 'ring-orange-400/30',
    shadow: 'shadow-[0_0_12px_rgba(249,115,22,0.5)]', // orange glow
  },
  {
    bg: 'from-rose-600 via-pink-500 to-fuchsia-400',
    ring: 'ring-rose-400/30',
    shadow: 'shadow-[0_0_12px_rgba(244,63,94,0.5)]', // rose glow
  },
  {
    bg: 'from-indigo-600 via-blue-500 to-sky-400',
    ring: 'ring-indigo-400/30',
    shadow: 'shadow-[0_0_12px_rgba(99,102,241,0.5)]', // indigo glow
  },
  {
    bg: 'from-amber-500 via-orange-500 to-red-400',
    ring: 'ring-amber-400/30',
    shadow: 'shadow-[0_0_12px_rgba(245,158,11,0.5)]', // amber glow
  },
  {
    bg: 'from-teal-500 via-emerald-500 to-green-400',
    ring: 'ring-teal-400/30',
    shadow: 'shadow-[0_0_12px_rgba(20,184,166,0.5)]', // teal glow
  },
] as const;

type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg';

type UserAvatarProps = {
  /** 유저 이름 (첫 글자가 아바타에 표시됨) */
  userName: string;
  /** 현재 사용자 여부 (강조 표시) */
  isCurrentUser?: boolean;
  /** 다중 접속 수 (2 이상이면 배지 표시) */
  connectionCount?: number;
  /** 아바타 크기 */
  size?: UserAvatarSize;
  /** 추가 스타일 (z-index 등) */
  style?: React.CSSProperties;
  /** 추가 className */
  className?: string;
};

const SIZE_CONFIG: Record<UserAvatarSize, { container: string; text: string; ring: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]', ring: 'ring-1' },
  sm: { container: 'w-7 h-7', text: 'text-[11px]', ring: 'ring-2' },
  md: { container: 'w-9 h-9', text: 'text-sm', ring: 'ring-2' },
  lg: { container: 'w-11 h-11', text: 'text-base', ring: 'ring-[3px]' },
};

const BADGE_SIZE_CLASSES: Record<UserAvatarSize, string> = {
  xs: 'min-w-[14px] h-3.5 text-[8px] -top-0.5 -right-0.5',
  sm: 'min-w-[16px] h-4 text-[9px] -top-1 -right-1',
  md: 'min-w-[18px] h-[18px] text-[10px] -top-1 -right-1',
  lg: 'min-w-[20px] h-5 text-[11px] -top-1.5 -right-1.5',
};

/**
 * 유저 아바타 컴포넌트
 *
 * 유저 이름 기반으로 일관된 그라데이션 색상을 생성하고,
 * 이름의 첫 글자를 표시합니다.
 *
 * @features
 * - 세련된 3색 그라데이션 배경
 * - box-shadow 기반 글로우 효과 (iOS Safari 최적화)
 * - CSS 그라데이션 하이라이트 (backdrop-filter 미사용)
 * - 현재 유저 링 강조 + 온라인 인디케이터
 * - 다중 접속 배지
 *
 * @performance
 * - backdrop-filter: blur() 미사용 (iOS Safari 성능 이슈)
 * - filter: blur() 미사용 (box-shadow로 대체)
 * - GPU 가속: transform, opacity 애니메이션만 사용
 *
 * @example
 * <UserAvatar userName="홍길동" />
 * <UserAvatar userName="김철수" isCurrentUser connectionCount={2} size="md" />
 */
export function UserAvatar({
  userName,
  isCurrentUser = false,
  connectionCount,
  size = 'sm',
  style,
  className = '',
}: UserAvatarProps) {
  // 이름 첫 글자 추출 (한글/영문 모두 지원)
  const initial = userName.charAt(0).toUpperCase();

  // 이름 기반 테마 선택 (일관된 색상)
  const theme = useMemo(() => {
    const themeIndex = userName.charCodeAt(0) % AVATAR_THEMES.length;
    return AVATAR_THEMES[themeIndex];
  }, [userName]);

  const sizeConfig = SIZE_CONFIG[size];
  const badgeSizeClass = BADGE_SIZE_CLASSES[size];
  const showBadge = connectionCount && connectionCount > 1;

  return (
    <div className={`relative ${className}`} style={style}>
      {/* 메인 아바타 - box-shadow로 글로우 효과 (blur 미사용) */}
      <div
        className={`
          relative flex items-center justify-center
          ${sizeConfig.container} ${sizeConfig.text}
          rounded-full
          bg-gradient-to-br ${theme.bg}
          ${sizeConfig.ring} ${isCurrentUser ? 'ring-emerald-400' : theme.ring}
          ${theme.shadow}
          font-semibold text-white
          overflow-hidden
        `}
        title={`${userName}${isCurrentUser ? ' (나)' : ''}`}
      >
        {/* 내부 하이라이트 - CSS gradient (backdrop-filter 미사용) */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 50%, rgba(0,0,0,0.15) 100%)',
          }}
        />

        {/* 상단 빛 반사 효과 */}
        <div
          className="absolute top-0 left-1/4 right-1/4 h-1/3 rounded-full pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 100%)',
          }}
        />

        {/* 이니셜 */}
        <span className="relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)]">
          {initial}
        </span>
      </div>

      {/* 현재 유저 온라인 인디케이터 */}
      {isCurrentUser && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-slate-900" />
        </span>
      )}

      {/* 다중 접속 배지 - 불투명 배경 (backdrop-blur 미사용) */}
      {showBadge && (
        <span
          className={`
            absolute flex items-center justify-center
            ${badgeSizeClass} px-1 rounded-full
            bg-slate-800 border border-slate-600/80
            font-bold text-slate-200
            shadow-md
          `}
        >
          ×{connectionCount}
        </span>
      )}
    </div>
  );
}
