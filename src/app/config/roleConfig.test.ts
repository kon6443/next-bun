import { describe, it, expect } from 'vitest';
import { getRoleMeta, getRoleBadge, ROLES } from './roleConfig';

describe('getRoleMeta', () => {
  it('대소문자·앞뒤 공백과 무관하게 매칭한다', () => {
    expect(getRoleMeta('master')).toBe(ROLES.MASTER);
    expect(getRoleMeta(' Manager ')).toBe(ROLES.MANAGER);
  });

  it.each([null, undefined, '', '   ', 'OWNER', 'constructor', '__proto__'])(
    '미정의·빈 값 %s 은 MEMBER로 폴백한다',
    role => {
      expect(getRoleMeta(role)).toBe(ROLES.MEMBER);
    },
  );
});

describe('getRoleBadge (하위 호환)', () => {
  it('getRoleMeta와 같은 label·className을 준다', () => {
    expect(getRoleBadge('MASTER')).toEqual({ label: ROLES.MASTER.label, className: ROLES.MASTER.className });
    expect(getRoleBadge(null).label).toBe(ROLES.MEMBER.label);
  });
});
