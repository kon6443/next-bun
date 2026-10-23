/**
 * 시뮬레이터 워커 프로세스 (pool.ts가 fork) — 부모가 보낸 일을 JOBS로 돌려 결과를 돌려보낸다
 * 일은 받은 순서대로 하나씩(동기) 돈다 — 워커 안 판 상태(무한 보정 판)도 그 순서로 이어진다
 */

import { JOBS, type JobName } from './jobs';

type Request = { id: number; job: JobName; args: readonly unknown[] };

process.on('message', (message: Request) => {
  try {
    const result = (JOBS[message.job] as (...a: readonly unknown[]) => unknown)(...message.args);
    process.send?.({ id: message.id, result });
  } catch (err) {
    process.send?.({ id: message.id, error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
  }
});
process.on('disconnect', () => process.exit(0));
