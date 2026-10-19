import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock 은 파일 맨 위로 끌어올려지므로 그 안에서 쓰는 값도 hoisted 로 만든다
const { handlerMock } = vi.hoisted(() => ({ handlerMock: vi.fn() }));
vi.mock('next-auth', () => ({ default: () => handlerMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { GET } from './route';
import { getRequestContext } from '@/lib/requestContext';

const ctx = { params: Promise.resolve({ nextauth: ['callback', 'kakao'] }) };

beforeEach(() => {
  handlerMock.mockReset();
});

describe('NextAuth route 래퍼', () => {
  it('핸들러 안에서 요청 컨텍스트(사용자 IP)를 꺼낼 수 있다', async () => {
    let seen: string | undefined;
    handlerMock.mockImplementation(async () => {
      seen = getRequestContext()?.clientIp;
      return new Response('{}');
    });
    await GET(new Request('http://localhost/api/auth/session', { headers: { 'x-forwarded-for': '10.0.0.1, 203.0.113.9' } }), ctx);
    expect(seen).toBe('203.0.113.9');
  });
});
