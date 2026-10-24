import { describe, it, expect } from 'vitest';
import { isFullscreenGamePath, isGamesPath } from './gamesPaths';

describe('isGamesPath — "게임" 탭 활성', () => {
  it('게임 목록·테트리스·낚시(URL 유지) 하위 전부', () => {
    for (const path of ['/games', '/games/tetris', '/games/tetris/rankings', '/games/defense', '/fishing', '/fishing/guide/carp']) {
      expect(isGamesPath(path)).toBe(true);
    }
  });

  it('경로 경계를 지킨다', () => {
    for (const path of ['/', '/gamesX', '/fishingX', '/teams', '/feedback']) expect(isGamesPath(path)).toBe(false);
  });
});

describe('isFullscreenGamePath — 하단 내비 숨김', () => {
  it('낚시 플레이·테트리스 플레이·리플레이', () => {
    for (const path of ['/fishing', '/games/tetris/play', '/games/tetris/play/daily', '/games/tetris/replays/12', '/games/tetris/battle', '/games/tetris/battle/ABC234', '/games/tetris/challenge/41']) {
      expect(isFullscreenGamePath(path)).toBe(true);
    }
  });

  it('디펜스도 같은 규칙 — 플레이(모드·스테이지 하위)·리플레이', () => {
    for (const path of ['/games/defense/play/endless', '/games/defense/play/stage/s1', '/games/defense/replays/12', '/games/defense/replays/local/s1']) {
      expect(isFullscreenGamePath(path)).toBe(true);
    }
  });

  it('목록·소개·도감·랭킹은 보인다', () => {
    for (const path of [
      '/games',
      '/games/tetris',
      '/games/tetris/rankings',
      '/games/defense',
      '/games/defense/campaign',
      '/games/defense/rankings',
      '/fishing/guide',
      '/fishing/about',
      '/games/tetris/battles', // battle 접두 경계 — 세그먼트 단위로만 대전으로 본다
    ]) {
      expect(isFullscreenGamePath(path)).toBe(false);
    }
  });

  it('경로 경계를 지킨다 — play·replays로 시작하는 다른 이름은 아니다', () => {
    for (const path of ['/games/tetris/player', '/games/tetris/replaysX', '/games/play', '/gamesX/tetris/play']) {
      expect(isFullscreenGamePath(path)).toBe(false);
    }
  });
});
