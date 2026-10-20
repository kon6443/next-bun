import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from './errorUtils';
import { ApiError, NetworkError, NETWORK_ERROR_MESSAGE } from '@/types/api';

describe('extractErrorMessage', () => {
  it('Error면 message를 쓴다', () => {
    expect(extractErrorMessage(new Error('실패'), '기본')).toBe('실패');
  });

  it('ApiError(Error 하위)도 message를 쓴다', () => {
    expect(extractErrorMessage(new ApiError('TEAM_NOT_FOUND', '팀 없음', 404), '기본')).toBe('팀 없음');
  });

  it('NetworkError(fetch 실패)는 한국어 네트워크 안내', () => {
    expect(extractErrorMessage(new NetworkError(new TypeError('Failed to fetch')), '기본')).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('응답을 받은 뒤의 일반 TypeError는 네트워크 안내로 바꾸지 않는다', () => {
    expect(extractErrorMessage(new TypeError("Cannot read properties of undefined (reading 'map')"), '기본')).toBe(
      "Cannot read properties of undefined (reading 'map')",
    );
  });

  it.each([['문자열'], [{ message: '객체' }], [null], [undefined], [42]])(
    'Error가 아닌 값 %o 은 fallback',
    value => {
      expect(extractErrorMessage(value, '기본')).toBe('기본');
    },
  );
});
