/**
 * 엔진 동기화 매니페스트 (defense DESIGN §E0) — 백엔드 사본과 같은 계산으로 "엔진 폴더 해시 = 매니페스트"를 단정한다
 *
 * 대상: 엔진 루트 아래 `**\/*.ts` 중 `*.test.ts` 제외 + `__fixtures__/**` (이름이 `.`으로 시작하는 파일·폴더 제외)
 * 경로: 엔진 루트 기준 상대경로, `/` 구분, 문자열 코드 단위 사전순
 * 파일 해시: 내용 바이트 그대로의 sha256 hex
 * 전체 해시: 파일마다 `${path}\n${파일 sha256}\n`을 이어 붙인 UTF-8 문자열의 sha256 hex
 * 파일 형식: { engineVersion, sha256, files: [{ path, sha256 }] } — JSON 2칸 들여쓰기 + 끝 LF
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const ENGINE_ROOT = join(__dirname, '../engine');
export const MANIFEST_PATH = join(__dirname, 'ENGINE_MANIFEST.json');

export type EngineManifest = {
  engineVersion: number;
  sha256: string;
  files: { path: string; sha256: string }[];
};

/** 숨김 파일·폴더(.DS_Store 등)는 대상이 아니다 — 백엔드 사본 복사에서도 뺀다 */
function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
}

export function isManifestTarget(path: string): boolean {
  if (path.startsWith('__fixtures__/')) return true;
  return path.endsWith('.ts') && !path.endsWith('.test.ts');
}

/** 엔진 루트 기준 상대경로(`/`) 목록 — 해시 대상만, 사전순 */
export function listEngineFiles(root = ENGINE_ROOT): string[] {
  const all: string[] = [];
  walk(root, all);
  return all
    .map((full) => relative(root, full).split(sep).join('/'))
    .filter(isManifestTarget)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

export function computeManifest(engineVersion: number, root = ENGINE_ROOT): EngineManifest {
  const files = listEngineFiles(root).map((path) => ({ path, sha256: sha256(readFileSync(join(root, path))) }));
  const total = sha256(files.map((f) => `${f.path}\n${f.sha256}\n`).join(''));
  return { engineVersion, sha256: total, files };
}

export function formatManifest(manifest: EngineManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
