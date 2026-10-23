/**
 * 시뮬레이터 워커용 모듈 해석 훅 — 확장자 없는 상대 import('./bots')를 .ts / index.ts로 찾는다
 * 번들러(vite)가 하던 해석만 대신한다. 타입 제거는 Node 내장(--experimental-transform-types)
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HAS_EXTENSION = /\.[cm]?[jt]sx?$|\.json$/;

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !HAS_EXTENSION.test(specifier) && context.parentURL) {
    for (const suffix of ['.ts', '/index.ts']) {
      const url = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
  }
  return next(specifier, context);
}
