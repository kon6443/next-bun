import { describe, it, expect } from 'vitest';
import { serializeJsonLd } from './jsonLd';

describe('serializeJsonLd', () => {
  it('값의 </script>가 태그를 닫지 못하게 < 를 이스케이프한다', () => {
    const result = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(result).not.toContain('</script>');
    expect(result).toContain('\\u003c/script>');
  });

  it('JSON으로 다시 파싱하면 원래 값과 같다', () => {
    const data = { name: 'a < b', list: [1, '<tag>'] };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });
});
