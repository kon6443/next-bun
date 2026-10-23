import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { ENGINE_ROOT, isManifestTarget, listEngineFiles } from './manifest';

/**
 * 금지 토큰 스캔 (§E1) — ESLint가 못 잡는 우회를 막는다: Math 별칭·전역 객체 경유·엔진 루트 밖 import·동적 코드
 * 주석·문자열은 지우고 검사한다(주석 속 "Math.random 금지" 같은 설명은 통과). 템플릿 리터럴의 ${...} 안은 코드로 남긴다
 */
const sources = listEngineFiles()
  .filter((path) => path.endsWith('.ts'))
  .map((path) => ({ path, code: readFileSync(join(ENGINE_ROOT, path), 'utf8') }));

/** 주석·문자열을 지운 코드 — 앞에서부터 한 글자씩: 문자열 안의 `//`·`/*`는 주석이 아니고, 템플릿의 ${} 안은 코드다 */
export function stripCommentsAndStrings(code: string): string {
  let out = '';
  /** 열린 템플릿마다 ${ 안 중괄호 깊이 — 0이면 템플릿 본문 */
  const templates: number[] = [];
  let i = 0;
  const inTemplateText = () => templates.length > 0 && templates[templates.length - 1] === 0;
  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];
    if (inTemplateText()) {
      if (c === '\\') i += 2;
      else if (c === '`') {
        templates.pop();
        out += '`';
        i++;
      } else if (c === '$' && next === '{') {
        templates[templates.length - 1] = 1;
        out += ' ';
        i += 2;
      } else i++;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 2;
      out += ' ';
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < code.length && code[i] !== c && code[i] !== '\n') i += code[i] === '\\' ? 2 : 1;
      i++;
      out += `${c}${c}`;
      continue;
    }
    if (c === '`') {
      templates.push(0);
      out += '`';
      i++;
      continue;
    }
    if (templates.length > 0 && c === '{') templates[templates.length - 1] += 1;
    if (templates.length > 0 && c === '}') {
      templates[templates.length - 1] -= 1;
      if (templates[templates.length - 1] === 0) {
        out += ' ';
        i++;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bMath\b(?!\s*\.\s*(imul|min|max|abs|floor|trunc)\b)/, 'Math는 허용 목록 멤버로만 (별칭·대괄호 접근 금지)'],
  [/\b(globalThis|window|self|document|navigator|process|global|crypto)\b/, '전역 객체'],
  [/\b(Date|performance|Intl)\b/, '시간·환경 의존'],
  [/\b(Map|Set|WeakMap|WeakSet|Symbol|Proxy|Reflect)\b/, '순회 순서·메타 객체'],
  [/\b(eval|Function|require)\s*\(/, '동적 코드·CommonJS'],
  [/\bimport\s*\(/, '동적 import'],
  [/\bconstructor\b/, 'constructor 경유 동적 코드'],
  [/\bObject\s*(\.\s*(keys|values|entries|getOwnPropertyNames)\b|\[)/, 'Object 열거 순서 의존·대괄호 접근'],
  [/\b(parseFloat|parseInt|toFixed|toPrecision|EPSILON|JSON)\b/, '부동소수 변환'],
  [/\bNumber\s*\(/, 'Number() 변환'],
  [/\*\*/, '거듭제곱'],
  [/\bfor\s*\([^)]*\bin\b/, 'for…in (키 순서 의존)'],
];

/** import·export from의 대상이 확장자 없는 상대경로이고 엔진 루트 안으로만 풀리는지 — 문제면 설명, 아니면 null */
function importProblem(path: string, code: string): string | null {
  for (const m of code.matchAll(/\b(?:import|export)\b[^'";]*?from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (!spec.startsWith('./') && !spec.startsWith('../')) return `외부 모듈 ${spec}`;
    // 숨김 폴더·파일은 매니페스트·사본·이 스캔에서 빠진다
    if (spec.split('/').some((part) => part.startsWith('.') && part !== '.' && part !== '..')) return `숨김 경로 import ${spec}`;
    // .json 등을 엔진이 직접 읽으면 매니페스트(.ts·__fixtures__만) 밖 파일에 결과가 묶인다
    if (/\.[a-z0-9]+$/i.test(spec.split('/').pop() ?? '')) return `확장자 있는 import ${spec}`;
    const resolved = normalize(join(dirname(join(ENGINE_ROOT, path)), spec));
    if (relative(ENGINE_ROOT, resolved).startsWith('..')) return `엔진 루트 밖 ${spec}`;
  }
  return null;
}

function walkAll(dir: string, base: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkAll(join(dir, entry.name), rel, out);
    else out.push(rel);
  }
}

const caught = (code: string) => FORBIDDEN.some(([pattern]) => pattern.test(stripCommentsAndStrings(code)));

describe('엔진 금지 토큰 스캔', () => {
  it('스캔 대상이 있다', () => {
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  it('엔진 폴더에는 매니페스트 대상과 테스트 파일만 있다 (대상 밖 파일은 백엔드 사본과 어긋나도 못 잡는다)', () => {
    const all: string[] = [];
    walkAll(ENGINE_ROOT, '', all);
    expect(all.filter((path) => !isManifestTarget(path) && !path.endsWith('.test.ts'))).toEqual([]);
  });

  for (const { path, code } of sources) {
    it(path, () => {
      const stripped = stripCommentsAndStrings(code);
      for (const [pattern, why] of FORBIDDEN) {
        const match = stripped.match(pattern);
        expect(match ? `${why}: ${match[0]}` : null).toBeNull();
      }
      expect(importProblem(path, code)).toBeNull();
    });
  }

  it('스캐너가 우회를 실제로 잡는다 (자체 점검)', () => {
    for (const bad of [
      'const M = Math; M.sqrt(2);',
      'globalThis.Math.random()',
      'const t = Date.now()',
      "Math['random']()",
      'const v = parseFloat(x); const t = n.toFixed(2);',
      'for (const k in obj) {}',
      "const u = 'http://x'; const M = Math; M.random();", // 문자열 속 // 뒤도 코드다
      "const a = '/*'; const M = Math; const b = '*/';",
      'const s = `${(M = Math)}`;', // 템플릿 ${} 안은 코드다
      'crypto.getRandomValues(a)',
      'x **= -1',
      "Number('0.5')",
      'Number.EPSILON',
      "JSON.parse('0.25')",
      "Object['keys'](o)",
      "(0).constructor.constructor('return 1')()",
    ]) {
      expect(caught(bad), bad).toBe(true);
    }
    for (const ok of [
      'Math.floor(a / b) + Math.imul(a, b)',
      '// Math.random 금지\nconst s = "Date";',
      'for (let i = 0; i < n; i++) {}',
      'const s = `id ${a + b} 끝`; Number.isInteger(x); Number.MAX_SAFE_INTEGER;',
    ]) {
      expect(caught(ok), ok).toBe(false);
    }
    expect(importProblem('game.ts', "import { a } from '../../tetris/engine';")).toContain('엔진 루트 밖');
    expect(importProblem('data/towers.ts', "export * from 'lodash';")).toContain('외부 모듈');
    expect(importProblem('data/stages.ts', "import waves from './waves.json';")).toContain('확장자');
    expect(importProblem('data/towers.ts', "import { DAMAGE } from '../constants';")).toBeNull();
    expect(importProblem('game.ts', "import { u } from './.lib/util';")).toContain('숨김 경로');
  });
});
