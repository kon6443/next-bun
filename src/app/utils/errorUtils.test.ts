import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from './errorUtils';
import { ApiError } from '@/types/api';

describe('extractErrorMessage', () => {
  it('Error면 message를 쓴다', () => {
    expect(extractErrorMessage(new Error('실패'), '기본')).toBe('실패');
  });

  it('ApiError(Error 하위)도 message를 쓴다', () => {
    expect(extractErrorMessage(new ApiError('TEAM_NOT_FOUND', '팀 없음', 404), '기본')).toBe('팀 없음');
  });

  it.each([['문자열'], [{ message: '객체' }], [null], [undefined], [42]])(
    'Error가 아닌 값 %o 은 fallback',
    value => {
      expect(extractErrorMessage(value, '기본')).toBe('기본');
    },
  );
});
