import { describe, it, expect } from 'vitest';
import { resolveServerApiBase } from './serverFetch';

describe('resolveServerApiBase', () => {
  it('SERVER_API_BASE 가 있으면 내부 주소로 직행한다', () => {
    expect(resolveServerApiBase('http://prod_nest_app:3500', 'https://example.org'))
      .toBe('http://prod_nest_app:3500');
  });

  it('없거나 비어 있으면 NEXT_PUBLIC_API 로 폴백한다 (로컬 dev·롤백)', () => {
    expect(resolveServerApiBase(undefined, 'https://example.org')).toBe('https://example.org');
    expect(resolveServerApiBase('', 'https://example.org')).toBe('https://example.org');
  });

  it('둘 다 없으면 빈 문자열', () => {
    expect(resolveServerApiBase(undefined, undefined)).toBe('');
  });
});
