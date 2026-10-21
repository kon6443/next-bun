/**
 * 게임 경로 판정 — 하단 내비(BottomNavBar) 활성 표시·숨김에 쓴다
 */

export const GAMES_PATH = '/games';

const startsWithSegment = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** "게임" 탭 활성: 게임 목록·각 게임·낚시(URL 유지) */
export function isGamesPath(path: string): boolean {
  return startsWithSegment(path, GAMES_PATH) || startsWithSegment(path, '/fishing');
}

/** /games/{게임}/play·/games/{게임}/replays 와 그 하위 — 게임마다 같은 경로 규칙 */
const FULLSCREEN_GAME_ROUTE = /^\/games\/[^/]+\/(play|replays)(\/|$)/;

/** 전체화면 게임 화면 — 하단 내비를 숨긴다 (낚시 도감·소개, 게임 허브·랭킹·대전 기록은 보인다) */
export function isFullscreenGamePath(path: string): boolean {
  // 테트리스 대전(/games/tetris/battle 하위)은 play·replays 규칙 밖이라 따로
  return path === '/fishing' || FULLSCREEN_GAME_ROUTE.test(path) || startsWithSegment(path, '/games/tetris/battle');
}
