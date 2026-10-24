import { type CorpusCase, corpusCase } from './corpus';

/** 코퍼스 전체 판 수 — 픽스처(corpus.expected.json)가 이만큼 담는다 */
export const CORPUS_SIZE = 4000;

const groupOf = (c: CorpusCase) => `${c.mode}/${c.bot}`;

/** 기본 실행(CI) 표본 — (모드·봇) 구성마다 첫 판 하나. 봇 경로(명령 고르기)까지 포함한 확인. 전체는 DEFENSE_CORPUS=full */
export function defaultSampleIds(size = CORPUS_SIZE): number[] {
  const seen = new Set<string>();
  const ids: number[] = [];
  for (let id = 0; id < size; id++) {
    const key = groupOf(corpusCase(id));
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

/**
 * 이식용(portable.json — 백엔드 사본도 쓴다) 대표 표본 — 구성별 고르게
 * (모드·봇)마다 3판 · 캠페인 보드(8스테이지 × 난이도 3 + 시험 스테이지 3)마다 1판 · 주간 서로 다른 주차 키 6개 · idle(판 상한) 최소 2판
 * (주간 판 내용은 seed로 정해져 주차 키는 라벨일 뿐 — 주간 다양성은 seed가 만든다)
 * 크기는 백엔드 단위 테스트 30초 안(입력 로그 재생 2회 — simulateReplay·중간 해시)
 */
export function portableIds(size = CORPUS_SIZE): number[] {
  const perGroup = new Map<string, number>();
  const boards = new Set<string>();
  const weeklyKeys = new Set<string>();
  let idle = 0;
  const picked = new Set<number>();
  for (let id = 0; id < size; id++) {
    const c = corpusCase(id);
    const group = groupOf(c);
    const n = perGroup.get(group) ?? 0;
    if (n < 3) {
      perGroup.set(group, n + 1);
      picked.add(id);
    }
    if (c.mode === 'campaign' && !boards.has(c.boardKey)) {
      boards.add(c.boardKey);
      picked.add(id);
    }
    if (c.mode === 'weekly' && weeklyKeys.size < 6 && !weeklyKeys.has(c.boardKey)) {
      weeklyKeys.add(c.boardKey);
      picked.add(id);
    }
    if (c.bot === 'idle' && idle < 2) {
      idle++;
      picked.add(id);
    }
  }
  return [...picked].sort((a, b) => a - b);
}
