import { describe, it, expect } from 'vitest';
import { boardCues, shouldFireAttack, soundBoardId } from './replayFx';

describe('대전 다시보기 연출 규칙 (games-polish P7)', () => {
  const players = [
    { playerId: 'a', place: 2 },
    { playerId: 'b', place: 1 },
  ];

  it('소리 판 — 크게 보는 판, 없으면 1위 판', () => {
    expect(soundBoardId(players, null)).toBe('b');
    expect(soundBoardId(players, 'a')).toBe('a');
    expect(soundBoardId([], null)).toBeNull();
  });

  it('소리 판 신호 — gameOver는 빼고(ko로 따로), 4배속은 큰 사건만', () => {
    const cues = [{ kind: 'move' }, { kind: 'clear', value: 4 }, { kind: 'gameOver' }] as const;
    expect(boardCues(cues, 1).map((c) => c.kind)).toEqual(['move', 'clear']);
    expect(boardCues(cues, 4).map((c) => c.kind)).toEqual(['clear']);
  });

  it('궤적 — 보낸 사람을 알고, 두 판이 보이고, 4배속은 4줄 이상만', () => {
    expect(shouldFireAttack('a', 'b', 2, 1, null)).toBe(true);
    expect(shouldFireAttack(null, 'b', 2, 1, null)).toBe(false);
    expect(shouldFireAttack('a', 'b', 0, 1, null)).toBe(false);
    expect(shouldFireAttack('a', 'b', 2, 1, 'b')).toBe(false);
    expect(shouldFireAttack('a', 'b', 3, 4, null)).toBe(false);
    expect(shouldFireAttack('a', 'b', 4, 4, null)).toBe(true);
  });
});
