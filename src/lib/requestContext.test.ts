import { describe, it, expect } from 'vitest';
import { extractClientIp, getRequestContext, runWithRequestContext } from './requestContext';

const h = (value?: string) => new Headers(value === undefined ? {} : { 'x-forwarded-for': value });

describe('extractClientIp', () => {
  it('여러 값이면 마지막 값(바로 앞 프록시가 붙인 주소)을 쓴다', () => {
    expect(extractClientIp(h('10.0.0.3, 10.0.0.2, 203.0.113.5'))).toBe('203.0.113.5');
  });

  it('클라이언트가 앞에 위조해 넣은 값은 무시한다', () => {
    expect(extractClientIp(h('1.2.3.4, 203.0.113.5'))).toBe('203.0.113.5');
    expect(extractClientIp(h('evil, 203.0.113.5'))).toBe('203.0.113.5');
  });

  it('값이 하나면 그 값을 쓰고, 앞뒤 공백을 무시한다', () => {
    expect(extractClientIp(h('  203.0.113.5  '))).toBe('203.0.113.5');
    expect(extractClientIp(h('10.0.0.2 ,  203.0.113.5 '))).toBe('203.0.113.5');
  });

  it('IPv6 도 받는다', () => {
    expect(extractClientIp(h('10.0.0.2, 2001:db8::1'))).toBe('2001:db8::1');
  });

  it('마지막 값의 형식이 틀리거나 비어 있으면 undefined (헤더를 붙이지 않게)', () => {
    expect(extractClientIp(h())).toBeUndefined();
    expect(extractClientIp(h(''))).toBeUndefined();
    expect(extractClientIp(h('unknown'))).toBeUndefined();
    expect(extractClientIp(h('203.0.113.5:443'))).toBeUndefined();
    expect(extractClientIp(h('203.0.113.5, <script>'))).toBeUndefined();
    expect(extractClientIp(h('203.0.113.5,'))).toBeUndefined();
  });
});

describe('runWithRequestContext', () => {
  it('await·타이머·fetch 를 지나도 컨텍스트가 유지되고, 밖에서는 비어 있다', async () => {
    let seen: string | undefined;
    await runWithRequestContext({ clientIp: '203.0.113.7' }, async () => {
      await new Promise(r => setTimeout(r, 5));
      await Promise.resolve();
      seen = getRequestContext()?.clientIp;
    });
    expect(seen).toBe('203.0.113.7');
    expect(getRequestContext()).toBeUndefined();
  });

  it('동시에 처리되는 요청끼리 섞이지 않는다', async () => {
    const results = await Promise.all(
      ['198.51.100.1', '198.51.100.2'].map(ip =>
        runWithRequestContext({ clientIp: ip }, async () => {
          await new Promise(r => setTimeout(r, ip.endsWith('1') ? 10 : 1));
          return getRequestContext()?.clientIp;
        }),
      ),
    );
    expect(results).toEqual(['198.51.100.1', '198.51.100.2']);
  });
});
