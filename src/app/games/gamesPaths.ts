/**
 * 게임 경로 판정 — 하단 내비(BottomNavBar) 활성 표시·숨김에 쓴다
 */

export const GAMES_PATH = '/games';

const startsWithSegment = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** "게임" 탭 활성: 게임 목록·테트리스·낚시(URL 유지) */
export function isGamesPath(path: string): boolean {
  return startsWithSegment(path, GAMES_PATH) || startsWithSegment(path, '/fishing');
}

/** 전체화면 게임 화면 — 하단 내비를 숨긴다 (낚시 도감·소개는 보인다) */
export function isFullscreenGamePath(path: string): boolean {
  return (
    path === '/fishing' ||
    path === '/games/tetris/play' ||
    path.startsWith('/games/tetris/replays/') ||
    startsWithSegment(path, '/games/tetris/battle')
  );
}
