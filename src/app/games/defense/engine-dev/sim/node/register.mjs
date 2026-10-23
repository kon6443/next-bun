// 시뮬레이터 워커 시작 시 --import로 읽는다 — 해석 훅 등록 (pool.ts)
import { register } from 'node:module';

register('./resolveTs.mjs', import.meta.url);
