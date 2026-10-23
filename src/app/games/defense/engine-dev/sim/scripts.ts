/**
 * 각본 봇 빌드 순서 (defense DESIGN §S2) — 스테이지마다 고정 명령 목록(의도 확인·회귀용)
 * 초안 = 생성 시점 기준 봇의 구매 순서를 그대로 옮긴 것 — 디자이너가 의도(새 타워 써 보기 등)대로 다듬는다
 * 웨이브 데이터를 다시 만들면 기준 봇 순서도 바뀔 수 있다 — 각본은 바뀌지 않으므로 CI 스모크가 회귀를 잡는다
 */

import { OP, TOWER_ID } from '../../engine';
import type { ScriptStep } from './bots';

const { ARCHER: A, CANNON: C, MAGE: M, FROST: F, CROSSBOW: X, TESLA: T } = TOWER_ID;
const b = (slot: number, kind: number): ScriptStep => ({ op: OP.BUILD, a: slot, b: kind });
const u = (slot: number): ScriptStep => ({ op: OP.UPGRADE, a: slot });
const br = (slot: number, branch: number): ScriptStep => ({ op: OP.BRANCH, a: slot, b: branch });

/** 인덱스 = 스테이지 − 1 */
export const CAMPAIGN_SCRIPTS: readonly (readonly ScriptStep[])[] = [
  // S1
  [b(7, C), b(5, C), b(6, C), u(7), u(5), u(6), b(1, C), u(1), b(3, C), u(3), u(7), b(0, C), u(0), u(5), b(4, C)],
  // S2
  [b(2, M), b(7, M), u(2), u(7), u(2), b(3, C), u(7), u(3), b(1, M), u(1), b(8, M), u(8), b(4, M), br(2, 0), u(4), b(5, M), u(5), u(1), b(6, M), u(6), b(0, A), u(0), u(8), u(4), u(3), u(5), u(6), u(0), br(7, 0), br(1, 0)],
  // S3
  [b(6, M), u(6), b(3, C), u(6), u(3), b(1, C), u(1), b(8, F), u(8), b(9, M), u(9), b(5, M), u(5), b(2, M), u(2), b(7, M), u(7), br(6, 0), u(9), b(4, A), u(4), u(8), b(0, M), u(0), u(3), u(5), u(1), u(2), u(7), br(9, 0), u(4), u(0), br(8, 0), br(4, 0), br(5, 0), br(3, 1), br(2, 0), br(1, 1), br(7, 0), br(0, 0)],
  // S4
  [b(5, M), b(3, A), b(2, X), b(8, X), u(5), u(3), u(2), b(9, M), u(9), u(8), b(7, M), u(5), u(7), b(4, M), u(4), b(0, F), u(0), b(6, M), u(6), u(9), u(7), u(4), u(0), u(3), br(5, 0)],
  // S5
  [b(10, M), b(9, M), b(4, M), u(10), u(9), b(7, M), u(4), u(7), b(8, A), u(8), b(2, A), u(2), b(0, C), u(0), b(1, C), u(1), u(10), b(3, A), u(3), br(10, 0), u(9), u(4), u(7), u(8), b(6, A), u(6), u(6), b(5, A), u(5), u(2), u(3), u(5), u(0), u(1), br(3, 0), br(8, 0), br(2, 0), br(9, 0), br(4, 0), br(5, 0), br(7, 0), br(6, 0), br(0, 1), br(1, 1), u(8), u(3), u(2), u(10), u(9), u(4), u(6)],
  // S6
  [b(8, T), b(9, T), b(7, M), b(10, T), b(11, T), b(6, M), u(7), u(8), u(10), u(11), u(6), u(9), b(5, X), b(2, T), u(2), u(5), b(3, A), u(3), u(7), u(8), b(0, T), u(0), b(4, C), u(4), u(9), u(6), u(10), b(1, X), u(1), u(11), u(3), u(2), u(4), u(0), u(5), u(1), br(3, 0), br(7, 0), br(8, 1), br(9, 1), br(6, 0), br(10, 1), br(11, 1), br(2, 1), br(0, 1), br(4, 1), u(3)],
  // S7
  [b(3, C), b(5, C), b(6, C), b(8, C), b(10, C), b(11, C), u(3), u(5), u(6), u(8), u(10), u(11), u(3), u(5), b(9, X), u(9), b(1, T), u(1), u(9), b(2, X), br(9, 1), u(2), b(0, T), u(0), u(6), u(1), b(7, A), u(7), u(8), b(4, C), u(4), u(10), u(11), u(7), u(4), u(0), br(7, 0), br(3, 1), br(5, 1), br(6, 1), br(8, 1), br(10, 1), br(11, 1), br(1, 1), u(7), u(3)],
  // S8
  [b(5, T), b(7, T), b(8, T), b(9, T), b(10, T), b(11, T), b(12, T), u(5), u(7), u(8), u(9), u(10), u(11), u(12), b(4, C), u(4), b(3, C), u(3), b(6, A), u(6), b(2, C), u(2), b(0, C), u(0), u(5), b(1, A), u(1), u(1), u(8), u(10), u(7), u(9), u(11), u(12), u(4), u(6), u(3), u(2), u(0), br(6, 0), br(5, 1), br(7, 1), br(8, 1), br(9, 1), br(10, 1), u(6), br(11, 1), br(12, 1), br(1, 0), br(4, 1), br(3, 1), br(2, 1), br(0, 1), u(1), u(4), u(5), u(7), u(8), u(9), u(10), u(11), u(12), u(3), u(2), u(0)],
];
