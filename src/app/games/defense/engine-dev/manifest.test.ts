import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ENGINE_VERSION } from '../engine';
import { MANIFEST_PATH, computeManifest, isManifestTarget, listEngineFiles } from './manifest';

describe('엔진 매니페스트 (§E0 동기화 검사)', () => {
  it('엔진 폴더 해시 = ENGINE_MANIFEST.json — 다르면 엔진을 바꾸고 매니페스트를 안 만든 것(백엔드 사본도 같이 갱신)', () => {
    const saved = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    expect(computeManifest(ENGINE_VERSION)).toEqual(saved);
  });

  it('대상: *.ts(테스트 제외) + __fixtures__ — 사전순·`/` 구분', () => {
    expect(isManifestTarget('game.ts')).toBe(true);
    expect(isManifestTarget('data/towers.ts')).toBe(true);
    expect(isManifestTarget('game.test.ts')).toBe(false);
    expect(isManifestTarget('__fixtures__/golden-replays.json')).toBe(true);
    expect(isManifestTarget('README.md')).toBe(false);
    const files = listEngineFiles();
    expect(files).toContain('__fixtures__/golden-replays.json');
    expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    expect([...files].sort()).toEqual(files);
  });
});
