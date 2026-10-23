import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import manifest from './engine-copy-hashes.json';

/**
 * 엔진 사본 드리프트 감시 (FE-07·BE-23) — 싱글·대전 엔진 코드와 golden fixture가 매니페스트 해시와 같은지
 * 엔진을 고치면 여기가 깨진다 → 매니페스트를 갱신하고 백엔드 매니페스트(같은 값이어야 한다)와 대조한다
 */
describe('엔진 사본 해시', () => {
  it.each(Object.entries(manifest.files))('%s', (file: string, expected: string) => {
    const actual = createHash('sha256')
      .update(readFileSync(path.join(__dirname, file)))
      .digest('hex');
    expect(actual).toBe(expected);
  });
});
