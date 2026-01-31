/**
 * 팀 역할(권한) 관리 설정
 */

export type RoleKey = 'MASTER' | 'MANAGER' | 'MEMBER';

export type RoleMeta = {
  key: RoleKey;
  label: string;
  className: string;
};

export const ROLES: Record<RoleKey, RoleMeta> = {
  MASTER: {
    key: 'MASTER',
    label: '마스터',
    className:
      'rounded-full bg-gradient-to-r from-yellow-500/20 to-orange-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-400 border border-yellow-500/30',
  },
  MANAGER: {
    key: 'MANAGER',
    label: '매니저',
    className:
      'rounded-full bg-gradient-to-r from-blue-500/20 to-indigo-500/20 px-2 py-0.5 text-xs font-semibold text-blue-400 border border-blue-500/30',
  },
  MEMBER: {
    key: 'MEMBER',
    label: '멤버',
    className:
      'rounded-full bg-gradient-to-r from-slate-500/20 to-slate-600/20 px-2 py-0.5 text-xs font-semibold text-slate-400 border border-slate-500/30',
  },
};

/**
 * 역할 문자열로 역할 메타데이터 가져오기
 * @param role - 역할 문자열 (대소문자 무관)
 * @returns RoleMeta 객체
 */
export function getRoleMeta(role: string | null | undefined): RoleMeta {
  const roleUpper = (role || 'MEMBER').trim().toUpperCase() as RoleKey;
  return ROLES[roleUpper] || ROLES.MEMBER;
}

/**
 * 역할 배지 정보 가져오기 (하위 호환성)
 * @deprecated getRoleMeta를 사용하세요
 */
export function getRoleBadge(role: string | null | undefined): { label: string; className: string } {
  const meta = getRoleMeta(role);
  return {
    label: meta.label,
    className: meta.className,
  };
}

/**
 * 현재 사용자 배지 스타일
 */
export const CURRENT_USER_BADGE_CLASSNAME =
  'rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 px-2 py-0.5 text-xs font-semibold text-purple-400 border border-purple-500/30';
