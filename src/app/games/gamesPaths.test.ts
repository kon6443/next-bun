import { describe, it, expect } from 'vitest';
import { isFullscreenGamePath, isGamesPath } from './gamesPaths';

describe('isGamesPath — "게임" 탭 활성', () => {
  it('게임 목록·테트리스·낚시(URL 유지) 하위 전부', () => {
    for (const path of ['/games', '/games/tetris', '/games/tetris/rankings', '/fishing', '/fishing/guide/carp']) {
      expect(isGamesPath(path)).toBe(true);
    }
  });

  it('경로 경계를 지킨다', () => {
    for (const path of ['/', '/gamesX', '/fishingX', '/teams', '/feedback']) expect(isGamesPath(path)).toBe(false);
  });
});

describe('isFullscreenGamePath — 하단 내비 숨김', () => {
  it('낚시 플레이·테트리스 플레이·리플레이', () => {
    for (const path of ['/fishing', '/games/tetris/play', '/games/tetris/replays/12']) {
      expect(isFullscreenGamePath(path)).toBe(true);
    }
  });

  it('목록·소개·도감·랭킹은 보인다', () => {
    for (const path of ['/games', '/games/tetris', '/games/tetris/rankings', '/fishing/guide', '/fishing/about']) {
      expect(isFullscreenGamePath(path)).toBe(false);
    }
  });
});
