/**
 * 시뮬레이터 병렬 실행 — 판 단위 일을 자식 Node 프로세스 여러 개에 나눠 돌린다 (새 의존성 없음)
 *   결과는 일 순서(입력 인덱스)대로 돌려준다 — 집계는 호출부가 순차 실행과 같은 순서로 하므로 결과가 바이트 단위로 같다
 *   (판은 seed·입력만으로 정해지고 기준 봇은 상태가 없다 — 어느 프로세스가 돌려도 같은 값)
 * 자식은 TS 원본을 Node 내장 타입 변환(--experimental-transform-types)과 확장자 해석 훅(node/register.mjs)으로 읽는다
 * 워커 수 = min(코어 − 1, DEFENSE_SIM_WORKERS(기본 4)) — 1이면 자식 없이 이 프로세스에서 순차 실행(비교 기준)
 */

import { type ChildProcess, fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { JOBS, type JobName } from './jobs';

const DEFAULT_WORKERS = 4;

export function workerCount(): number {
  const raw = Number(process.env.DEFENSE_SIM_WORKERS ?? DEFAULT_WORKERS);
  const cap = Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_WORKERS;
  return Math.max(1, Math.min(availableParallelism() - 1, cap));
}

export type SimPool = {
  readonly size: number;
  /**
   * 일 묶음 실행 — 결과[i] = JOBS[job](...argsList[i])
   * pin(i)를 주면 그 일은 늘 같은 워커(0 ~ size − 1)에서 돈다 — 워커 안에 판 상태를 이어 두는 일(무한 보정 판)용
   */
  map<R>(job: JobName, argsList: readonly (readonly unknown[])[], pin?: (index: number) => number): Promise<R[]>;
  close(): Promise<void>;
};

type Reply = { id: number; result?: unknown; error?: string };

function callJob(job: JobName, args: readonly unknown[]): unknown {
  return (JOBS[job] as (...a: readonly unknown[]) => unknown)(...args);
}

/** 순차(이 프로세스) — 워커 1개일 때·비교 기준 */
function inProcessPool(): SimPool {
  return {
    size: 1,
    async map<R>(job: JobName, argsList: readonly (readonly unknown[])[]) {
      return argsList.map((args) => callJob(job, args) as R);
    },
    async close() {},
  };
}

class Worker {
  private nextId = 0;
  private waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private exited: Error | null = null;

  constructor(private readonly child: ChildProcess) {
    child.on('message', (message: Reply) => {
      const entry = this.waiting.get(message.id);
      if (!entry) return;
      this.waiting.delete(message.id);
      if (message.error !== undefined) entry.reject(new Error(message.error));
      else entry.resolve(message.result);
    });
    const fail = (error: Error) => {
      this.exited ??= error;
      for (const entry of this.waiting.values()) entry.reject(this.exited);
      this.waiting.clear();
    };
    child.on('exit', (code) => fail(new Error(`시뮬레이터 워커가 끝났다(code ${code})`)));
    // 채널이 닫힌 뒤 send·disconnect 같은 IPC 오류 — 리스너가 없으면 부모 프로세스의 처리 안 된 오류가 된다
    child.on('error', (error) => fail(error));
  }

  call(job: JobName, args: readonly unknown[]): Promise<unknown> {
    if (this.exited) return Promise.reject(this.exited);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.child.send({ id, job, args });
    });
  }

  close(): Promise<void> {
    if (this.exited) {
      // IPC 오류로만 끝난 것으로 본 경우 자식이 아직 살아 있을 수 있다 — 남기지 않는다
      if (this.child.exitCode === null && !this.child.killed) this.child.kill();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.child.once('exit', () => resolve());
      // 자식이 이미 IPC를 끊었으면(죽는 중) exit만 기다린다 — 끊긴 채널에 disconnect하면 IPC 오류
      if (this.child.connected) this.child.disconnect();
    });
  }
}

function spawnWorker(): Worker {
  const entry = fileURLToPath(new URL('./poolWorker.ts', import.meta.url));
  const register = new URL('./node/register.mjs', import.meta.url).href;
  const child = fork(entry, [], {
    execArgv: [
      '--experimental-transform-types',
      '--disable-warning=ExperimentalWarning',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      '--import',
      register,
    ],
    serialization: 'advanced',
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  return new Worker(child);
}

export function openPool(size = workerCount()): SimPool {
  if (size <= 1) return inProcessPool();
  const workers = Array.from({ length: size }, spawnWorker);
  return {
    size,
    async map<R>(job: JobName, argsList: readonly (readonly unknown[])[], pin?: (index: number) => number) {
      const results: R[] = new Array(argsList.length);
      const pending = argsList.map((args, i) => ({ i, args, worker: pin ? pin(i) % size : -1 }));
      const drain = async (w: number) => {
        for (;;) {
          const at = pending.findIndex((p) => p.worker < 0 || p.worker === w);
          if (at < 0) return;
          const [next] = pending.splice(at, 1);
          results[next.i] = (await workers[w].call(job, next.args)) as R;
        }
      };
      await Promise.all(workers.map((_, w) => drain(w)));
      return results;
    },
    async close() {
      await Promise.all(workers.map((w) => w.close()));
    },
  };
}

/** 풀을 열어 fn을 돌리고 반드시 닫는다 */
export async function withPool<T>(fn: (pool: SimPool) => Promise<T>, size = workerCount()): Promise<T> {
  const pool = openPool(size);
  try {
    return await fn(pool);
  } finally {
    await pool.close();
  }
}
