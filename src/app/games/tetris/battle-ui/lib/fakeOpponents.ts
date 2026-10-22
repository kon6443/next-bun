import { ACTION } from '../../engine';
import { nextRandom } from '../../engine/random';
import { type BattleLock, type BattleState, createBattle, receiveGarbage, stepBattle } from '../../battle-engine';

/**
 * 가짜 상대 — 대전 화면 미리보기(서버 매치 전 레이아웃·연출 확인)용 봇
 * 같은 시드로 자기 판을 대전 래퍼로 진행하고, 일정 간격으로 무작위 회전·이동 후 하드 드롭한다
 */

export type FakeOpponent = {
  playerId: string;
  name: string;
  bs: BattleState;
  rng: number;
  nextDropAt: number;
  nextGarbageId: number;
  /** 탈락 순위 — 살아 있으면 null */
  place: number | null;
  kos: number;
};

const DROP_MIN_FRAMES = 30;
const DROP_SPREAD_FRAMES = 45;

function random(o: FakeOpponent, range: number): number {
  const [next, value] = nextRandom(o.rng);
  o.rng = next;
  return value % range;
}

export function createFakeOpponents(seed: number, names: string[]): FakeOpponent[] {
  return names.map((name, i) => ({
    playerId: `bot${i + 1}`,
    name,
    bs: createBattle({ seed, das: 10, arr: 2 }),
    rng: (seed ^ (0x9e3779b9 * (i + 1))) | 0,
    nextDropAt: DROP_MIN_FRAMES + i * 7,
    nextGarbageId: 1,
    place: null,
    kos: 0,
  }));
}

/** 봇 한 명에게 가비지 */
export function sendGarbageTo(o: FakeOpponent, lines: number, hole: number): void {
  receiveGarbage(o.bs, { id: o.nextGarbageId++, lines, hole });
}

/** 봇들을 한 프레임 진행 — 고정이 있으면 onLock */
export function stepFakeOpponents(list: FakeOpponent[], onLock: (o: FakeOpponent, lock: BattleLock) => void): void {
  for (const o of list) {
    const game = o.bs.game;
    if (game.over) continue;
    let actions: number[] = [];
    if (game.active && game.frame >= o.nextDropAt) {
      const rotations = random(o, 4);
      const shift = random(o, 9) - 4;
      actions = [];
      for (let i = 0; i < rotations; i++) actions.push(ACTION.ROTATE_CW);
      const press = shift < 0 ? ACTION.LEFT_PRESS : ACTION.RIGHT_PRESS;
      const release = shift < 0 ? ACTION.LEFT_RELEASE : ACTION.RIGHT_RELEASE;
      for (let i = 0; i < Math.abs(shift); i++) actions.push(press, release);
      actions.push(ACTION.HARD_DROP);
      o.nextDropAt = game.frame + DROP_MIN_FRAMES + random(o, DROP_SPREAD_FRAMES);
    }
    const { lock } = stepBattle(o.bs, actions, actions.length);
    if (lock) onLock(o, lock);
  }
}
