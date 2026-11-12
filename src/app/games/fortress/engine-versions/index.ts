import { ENGINE_VERSION } from '../engine/constants';

/**
 * 재생용 엔진 고르기 (fortress DESIGN §10 버전 동결 — 디펜스 engine-versions 복제) — 기록의 엔진 버전으로 그 버전 엔진을 동적 import
 * - 현재 버전은 engine/ 그대로. ENGINE_VERSION을 올릴 때 직전 엔진을 이 폴더 v{N}/에 동결 복사하고(자기 데이터·골든 포함)
 *   아래 표에 `N: () => import('./vN')`을 더한다 — 엔진 폴더 밖이라 매니페스트·백엔드 사본·엔진 ESLint 대상이 아니다
 * - 명시 표로만(템플릿 문자열 import는 타입·번들러 호환 위험). 옛 기록을 열 때만 그 버전 코드를 받는다
 * - v1은 보관하지 않았다(D-023 v2) — 배포 전이라 v1 기록은 E2E 시험 경기뿐이다. 그 기록은 "재생할 수 없어요" 안내(FortressReplay.test)
 * - 한계: 표가 나누는 것은 시뮬레이션뿐이다. 그리기·연출(renderer)은 현재 엔진의 상태·이벤트 모양을 정적으로 쓴다 —
 *   버전을 올릴 때 상태·EVENT 배치가 바뀌면 렌더러도 버전별 어댑터로 나눠야 한다
 */
export type ReplayEngine = typeof import('../engine');

const LOADERS: Readonly<Record<number, () => Promise<ReplayEngine>>> = {
  [ENGINE_VERSION]: () => import('../engine'),
};

/** 그 버전으로 재생할 수 있나 (엔진을 받기 전에 판정 — 화면 안내용) */
export function canReplayVersion(version: number): boolean {
  return LOADERS[version] !== undefined;
}

/** 그 버전 엔진 — 없는 버전(보관하지 않은 옛 엔진·미래 버전)이면 null */
export async function loadReplayEngine(version: number): Promise<ReplayEngine | null> {
  const load = LOADERS[version];
  return load ? load() : null;
}
