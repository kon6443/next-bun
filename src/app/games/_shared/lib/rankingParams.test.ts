import { describe, it, expect } from 'vitest';
import { parseHighlightId } from './rankingParams';

describe('parseHighlightId (games-polish FE-58)', () => {
  it('양의 정수 문자열만 id로, 나머지는 null', () => {
    expect(parseHighlightId('42')).toBe(42);
    for (const bad of [undefined, ['1'], '0', '-3', '1.5', '07', '1a', '']) expect(parseHighlightId(bad)).toBeNull();
  });
});
