import { writeFileSync } from 'node:fs';
import { describe, it } from 'vitest';
import { ENGINE_VERSION } from '../engine';
import { MANIFEST_PATH, computeManifest, formatManifest } from './manifest';

/**
 * 매니페스트 재생성 — 엔진 폴더(데이터·골든 포함)를 바꾼 뒤 돌린다. 같은 파일을 백엔드 사본 옆에도 복사한다(§E0)
 * DEFENSE_MANIFEST_WRITE=1 pnpm exec vitest run src/app/games/defense/engine-dev/manifest.generate.test.ts
 */
describe.runIf(process.env.DEFENSE_MANIFEST_WRITE === '1')('디펜스 엔진 매니페스트 생성', () => {
  it('엔진 폴더 해시를 기록한다', () => {
    writeFileSync(MANIFEST_PATH, formatManifest(computeManifest(ENGINE_VERSION)));
  });
});
