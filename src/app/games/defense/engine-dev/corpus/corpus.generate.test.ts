import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../../engine';
import { withPool } from '../sim/pool';
import type { runCorpusCase } from './corpus';
import { CORPUS_VERSION } from './corpus';
import { CHECKPOINT_TICKS, type PortableCase } from './portableRunner';
import { CORPUS_SIZE, portableIds } from './selection';

const CORPUS_PATH = join(__dirname, 'corpus.expected.json');
const PORTABLE_PATH = join(__dirname, 'portable.json');

/**
 * 차등 코퍼스 픽스처 생성 — **현재 엔진**을 기준으로 고정한다. 엔진 동작을 의도적으로 바꿨을 때만(ENGINE_VERSION을 올리는 변경) 다시 만든다
 * 리팩토링(동작 불변) 중에는 절대 다시 만들지 않는다 — 다시 만들면 안전망이 사라진다
 * 가드: 픽스처에 engineVersion을 적고, 기존 픽스처의 engineVersion이 지금 ENGINE_VERSION과 같으면 거부한다
 *   (동작을 바꾸려면 ENGINE_VERSION부터 올린다 — 같은 버전에서 꼭 다시 써야 하면 DEFENSE_CORPUS_FORCE=1, 커밋에 이유를 남긴다)
 * DEFENSE_CORPUS_WRITE=1 pnpm exec vitest run src/app/games/defense/engine-dev/corpus/corpus.generate.test.ts
 * 워커 수는 DEFENSE_SIM_WORKERS(기본 4, 코어 − 1 상한)
 */
describe.runIf(process.env.DEFENSE_CORPUS_WRITE === '1')('디펜스 차등 코퍼스 생성', () => {
  it('전체 판을 돌려 기대값과 이식용 표본을 쓴다', async () => {
    if (existsSync(CORPUS_PATH) && process.env.DEFENSE_CORPUS_FORCE !== '1') {
      const current = JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as { engineVersion?: number };
      if (current.engineVersion === ENGINE_VERSION) {
        throw new Error(`코퍼스는 이미 ENGINE_VERSION ${ENGINE_VERSION} 기준 — 리팩토링 중 재생성은 안전망을 지운다. 동작을 바꿨다면 ENGINE_VERSION부터 올린다(강제: DEFENSE_CORPUS_FORCE=1)`);
      }
    }
    const ids = Array.from({ length: CORPUS_SIZE }, (_, id) => id);
    type Run = ReturnType<typeof runCorpusCase>;
    const runs = await withPool((pool) => pool.map<Run>('corpusCase', ids.map((id) => [id])));
    expect(runs).toHaveLength(CORPUS_SIZE);
    // 한 줄에 한 판 — diff가 판 단위로 보이게
    const lines = runs.map((r) => JSON.stringify(r.expected));
    writeFileSync(CORPUS_PATH, `{"version":${CORPUS_VERSION},"engineVersion":${ENGINE_VERSION},"checkpointTicks":${CHECKPOINT_TICKS},"count":${CORPUS_SIZE},"cases":[\n${lines.join(',\n')}\n]}\n`);
    const portable: PortableCase[] = portableIds().map((id) => {
      const r = runs[id];
      return { id: `c${id}`, input: r.input, expected: { result: r.expected.result, checkpoints: r.checkpoints } };
    });
    writeFileSync(PORTABLE_PATH, `{"version":${CORPUS_VERSION},"engineVersion":${ENGINE_VERSION},"checkpointTicks":${CHECKPOINT_TICKS},"cases":[\n${portable.map((c) => JSON.stringify(c)).join(',\n')}\n]}\n`);
  }, 3_600_000);
});
