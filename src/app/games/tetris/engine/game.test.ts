import { describe, it, expect } from 'vitest';
import {
  ACTION,
  BOARD_WIDTH,
  GRAVITY_TABLE,
  LINE_CLEAR_DELAY_FRAMES,
  LOCK_DELAY_FRAMES,
  LOCK_RESET_LIMIT,
  SPAWN_DELAY_FRAMES,
  SPAWN_X,
  SPAWN_Y,
} from './constants';
import { type GameState, collides, createGame, getDropY, stepFrame } from './game';
import { PIECE, PIECE_COUNT } from './pieces';
import { nextRandom, shuffleBag } from './random';

const step = (state: GameState, ...actions: number[]) => stepFrame(state, actions, actions.length);

/** 판의 한 줄을 채운다 (holes 열은 비움) — y는 판 좌표(0 = 맨 위 숨은 줄, 39 = 맨 아래) */
function fillRow(state: GameState, y: number, holes: number[] = []): void {
  for (let x = 0; x < BOARD_WIDTH; x++) {
    state.board[y * BOARD_WIDTH + x] = holes.includes(x) ? 0 : 8 - 1;
  }
}

/** 조작 중인 블록을 원하는 블록·위치로 바꾼다 (규칙 단위 검증용) */
function setPiece(state: GameState, piece: number, rotation: number, x: number, y: number): void {
  state.piece = piece;
  state.rotation = rotation;
  state.x = x;
  state.y = y;
  state.lowestY = y;
  state.lockTimer = 0;
  state.lockResets = 0;
  state.lastMoveRotation = false;
  state.active = true;
}

const newGame = (das = 10, arr = 2) => createGame({ seed: 12345, das, arr });

describe('난수·7-bag', () => {
  it('같은 시드는 같은 순서, 7개마다 7종이 한 번씩', () => {
    const a = newGame();
    const b = newGame();
    expect(a.queue).toEqual(b.queue);

    let rng = 99;
    for (let round = 0; round < 50; round++) {
      const [next, bag] = shuffleBag(rng, PIECE_COUNT);
      rng = next;
      expect([...bag].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it('mulberry32는 32비트 부호 없는 정수를 낸다', () => {
    let s = 0;
    for (let i = 0; i < 1000; i++) {
      const [next, value] = nextRandom(s);
      s = next;
      expect(Number.isInteger(value) && value >= 0 && value <= 0xffffffff).toBe(true);
    }
  });
});

describe('생성', () => {
  it('생성 위치에 놓이고, 비어 있으면 한 칸 바로 내려온다. 다음 블록은 5개 이상 보인다', () => {
    const g = newGame();
    expect(g.active).toBe(true);
    expect(g.x).toBe(SPAWN_X);
    expect(g.y).toBe(SPAWN_Y + 1);
    expect(g.queue.length).toBeGreaterThanOrEqual(5);
  });

  it('블록 아웃: 생성 위치가 막혀 있으면 게임 오버', () => {
    const g = newGame();
    step(g, ACTION.HARD_DROP); // 첫 블록 고정 → 생성 지연
    for (let y = 18; y <= 21; y++) fillRow(g, y, [0]);
    for (let f = 0; f < SPAWN_DELAY_FRAMES && !g.over; f++) step(g);
    expect(g.over).toBe(true);
  });

  it('락 아웃: 줄을 못 지우고 블록 전체가 숨은 줄에서 고정되면 게임 오버', () => {
    const g = newGame();
    for (let y = 20; y < 40; y++) fillRow(g, y, [9]);
    setPiece(g, PIECE.O, 0, SPAWN_X, SPAWN_Y);
    step(g, ACTION.HARD_DROP);
    expect(g.over).toBe(true);
    expect(g.endFrame).toBe(1);
  });
});

describe('줄 삭제·점수', () => {
  it('1·2·3·4줄 = 100·300·500·800 × 레벨', () => {
    const cases: [number, number][] = [[1, 100], [2, 300], [3, 500], [4, 800]];
    for (const [lines, expected] of cases) {
      const g = newGame();
      for (let i = 0; i < lines; i++) fillRow(g, 39 - i, [9]);
      setPiece(g, PIECE.I, 1, 7, 39 - 3 - 0); // 세로 I: 상자 x+2 = 9열, 칸 y..y+3
      g.y = getDropY(g);
      step(g, ACTION.HARD_DROP);
      expect(g.lastLock?.lines).toBe(lines);
      expect(g.score).toBe(expected);
    }
  });

  it('줄은 삭제 지연이 끝날 때 지워지고 위 줄이 내려온다', () => {
    const g = newGame();
    fillRow(g, 39, [9]);
    g.board[38 * BOARD_WIDTH + 0] = 3; // 위에 남을 칸
    setPiece(g, PIECE.I, 1, 7, 30);
    step(g, ACTION.HARD_DROP);
    expect(g.clearingRows).toEqual([39]);
    for (let f = 0; f < LINE_CLEAR_DELAY_FRAMES - 1; f++) step(g);
    expect(g.active).toBe(false);
    step(g);
    expect(g.active).toBe(true);
    expect(g.board[39 * BOARD_WIDTH + 0]).toBe(3);
  });

  it('하드드롭 2점/칸, 소프트드롭 1점/칸', () => {
    const g = newGame();
    const startY = g.y;
    const dropY = getDropY(g);
    step(g, ACTION.HARD_DROP);
    expect(g.score).toBe((dropY - startY) * 2);

    const s = newGame();
    step(s, ACTION.SOFT_DROP_PRESS);
    const before = s.y;
    for (let f = 0; f < 10; f++) step(s);
    expect(s.score).toBe(s.y - before);
    expect(s.score).toBeGreaterThan(0);
  });

  it('백투백: 연속 테트리스는 ×3/2, 콤보는 50 × 콤보 × 레벨', () => {
    const g = newGame();
    for (let i = 0; i < 8; i++) fillRow(g, 39 - i, [9]);
    setPiece(g, PIECE.I, 1, 7, 20);
    step(g, ACTION.HARD_DROP);
    expect(g.lastLock?.points).toBe(800); // 하드드롭 점수는 따로
    for (let f = 0; f < LINE_CLEAR_DELAY_FRAMES; f++) step(g);
    setPiece(g, PIECE.I, 1, 7, 20);
    step(g, ACTION.HARD_DROP);
    const second = (800 * 3) / 2 + 50 * 1 * 1;
    expect(g.lastLock).toMatchObject({ lines: 4, backToBack: true, combo: 1, points: second });
    expect(g.tetrises).toBe(2);
    expect(g.maxCombo).toBe(1);
  });

  it('어려운 삭제가 아닌 줄 삭제는 백투백을 끊고, 줄을 못 지우면 콤보가 끊긴다', () => {
    const g = newGame();
    for (let i = 0; i < 4; i++) fillRow(g, 39 - i, [9]);
    fillRow(g, 35, [9]);
    setPiece(g, PIECE.I, 1, 7, 20);
    step(g, ACTION.HARD_DROP); // 테트리스
    expect(g.backToBack).toBe(true);
    for (let f = 0; f < LINE_CLEAR_DELAY_FRAMES; f++) step(g);
    setPiece(g, PIECE.I, 1, 7, 20);
    step(g, ACTION.HARD_DROP); // 남은 1줄 (I 세로 중 1칸만 그 줄)
    expect(g.lastLock?.lines).toBe(1);
    expect(g.backToBack).toBe(false);
    for (let f = 0; f < LINE_CLEAR_DELAY_FRAMES; f++) step(g);
    step(g, ACTION.HARD_DROP);
    expect(g.combo).toBe(-1);
  });

  it('레벨: 10줄마다 +1, 점수는 지우기 전 레벨로', () => {
    const g = newGame();
    g.lines = 9;
    fillRow(g, 39, [9]);
    setPiece(g, PIECE.I, 1, 7, 20);
    step(g, ACTION.HARD_DROP);
    expect(g.level).toBe(2);
    expect(g.lastLock?.points).toBe(100);
  });
});

describe('T-스핀', () => {
  /** T-스핀 더블 자리: 39행은 4열만, 38행은 3~5열 비움, 37행은 0~3열 채움(지붕) */
  function tsdBoard(g: GameState) {
    fillRow(g, 39, [4]);
    fillRow(g, 38, [3, 4, 5]);
    for (let x = 0; x <= 3; x++) g.board[37 * BOARD_WIDTH + x] = 1;
  }

  it('회전으로 들어가 앞 모서리 2개가 막히면 일반 T-스핀 — 더블 1200 × 레벨', () => {
    const g = newGame();
    tsdBoard(g);
    // 아래를 향한 T(회전 2)로 자리에 넣고 마지막 동작을 회전으로 둔다
    setPiece(g, PIECE.T, 3, 3, 37);
    expect(collides(g.board, PIECE.T, 3, 3, 37)).toBe(false);
    step(g, ACTION.ROTATE_CCW); // L → 2
    expect(g.rotation).toBe(2);
    expect(g.x).toBe(3);
    expect(g.y).toBe(37);
    step(g, ACTION.HARD_DROP);
    expect(g.lastLock).toMatchObject({ tSpin: 'full', lines: 2, points: 1200 });
    expect(g.tSpins).toBe(1);
  });

  it('모서리 3개지만 앞 모서리가 1개뿐이면 미니 — 줄 없음 100 × 레벨', () => {
    const g = newGame();
    // 왼쪽 벽(판 밖 = 막힘)·바닥에 붙은 오른쪽 향 T. 앞 모서리 중 (1,39)만 채움
    g.board[39 * BOARD_WIDTH + 1] = 1;
    setPiece(g, PIECE.T, 0, 0, 37);
    step(g, ACTION.ROTATE_CW); // 0 → R, 킥 1번(−1, 0)으로 벽에 붙는다
    expect(g).toMatchObject({ rotation: 1, x: -1, y: 37, lastKickIndex: 1 });
    step(g, ACTION.HARD_DROP);
    expect(g.lastLock).toMatchObject({ tSpin: 'mini', lines: 0, points: 100 });
  });

  it('회전 뒤 한 칸이라도 내려오면 T-스핀이 아니다', () => {
    const g = newGame();
    tsdBoard(g);
    setPiece(g, PIECE.T, 2, 3, 30);
    g.lastMoveRotation = true;
    step(g, ACTION.HARD_DROP);
    expect(g.lastLock?.tSpin).toBe('none');
  });
});

describe('회전·벽 킥', () => {
  it('왼쪽 벽에 붙은 세로 I를 CW로 돌리면 SRS 킥으로 벽 안쪽에 눕는다', () => {
    const g = newGame();
    setPiece(g, PIECE.I, 1, -2, 30); // 상자 x+2 = 0열
    step(g, ACTION.ROTATE_CW);
    expect(g.rotation).toBe(2);
    expect(g.lastKickIndex).toBe(2);
    expect(g.x).toBe(0);
  });

  it('O는 회전하지 않는다', () => {
    const g = newGame();
    setPiece(g, PIECE.O, 0, SPAWN_X, 30);
    step(g, ACTION.ROTATE_CW);
    expect(g.rotation).toBe(0);
    expect(g.lastMoveRotation).toBe(false);
  });
});

describe('홀드', () => {
  it('블록당 1회 — 처음엔 다음 블록을 꺼내고, 고정 후 다시 쓸 수 있다', () => {
    const g = newGame();
    const first = g.piece;
    const second = g.queue[0];
    step(g, ACTION.HOLD);
    expect(g.hold).toBe(first);
    expect(g.piece).toBe(second);
    step(g, ACTION.HOLD);
    expect(g.piece).toBe(second); // 같은 블록에서 두 번째 홀드는 무시
    step(g, ACTION.HARD_DROP);
    for (let f = 0; f < SPAWN_DELAY_FRAMES; f++) step(g);
    const current = g.piece;
    step(g, ACTION.HOLD);
    expect(g.piece).toBe(first);
    expect(g.hold).toBe(current);
  });
});

describe('DAS/ARR', () => {
  it('누르는 순간 1칸, DAS 프레임 뒤부터 ARR마다 1칸', () => {
    const g = newGame(6, 2);
    g.level = 1;
    const x0 = g.x;
    step(g, ACTION.LEFT_PRESS); // 프레임 0
    expect(g.x).toBe(x0 - 1);
    for (let f = 1; f < 6; f++) step(g);
    expect(g.x).toBe(x0 - 1);
    step(g); // 충전 6 = DAS → 이동
    expect(g.x).toBe(x0 - 2);
    step(g);
    expect(g.x).toBe(x0 - 2);
    step(g); // ARR 2
    expect(g.x).toBe(x0 - 3);
  });

  it('ARR 0이면 DAS가 차는 순간 벽까지', () => {
    const g = newGame(4, 0);
    step(g, ACTION.RIGHT_PRESS);
    for (let f = 1; f <= 4; f++) step(g);
    expect(collides(g.board, g.piece, g.rotation, g.x + 1, g.y)).toBe(true);
  });

  it('반대쪽을 누르면 마지막에 누른 방향이 이기고, 떼면 남은 방향으로 새로 충전', () => {
    const g = newGame(6, 2);
    const x0 = g.x;
    step(g, ACTION.LEFT_PRESS);
    step(g, ACTION.RIGHT_PRESS);
    expect(g.x).toBe(x0);
    expect(g.shiftDirection).toBe(1);
    step(g, ACTION.RIGHT_RELEASE);
    expect(g.shiftDirection).toBe(-1);
    expect(g.shiftCharge).toBe(0);
  });
});

describe('고정 지연', () => {
  it('바닥에 닿은 뒤 30프레임에 고정', () => {
    const g = newGame();
    g.y = getDropY(g);
    let frames = 0;
    while (g.active) {
      step(g);
      frames++;
    }
    expect(frames).toBe(LOCK_DELAY_FRAMES);
  });

  it('이동하면 고정 대기가 처음부터 — 15회까지만', () => {
    const g = newGame();
    g.y = getDropY(g);
    let frames = 0;
    let dir: number = ACTION.LEFT_PRESS;
    while (g.active && frames < 2000) {
      step(g);
      step(g, dir, dir + 1); // 누르고 바로 떼기 = 1칸
      dir = dir === ACTION.LEFT_PRESS ? ACTION.RIGHT_PRESS : ACTION.LEFT_PRESS;
      frames += 2;
    }
    expect(g.active).toBe(false);
    expect(g.lastLock).not.toBeNull();
    // 매번 2프레임마다 리셋 → 15회 소진 후 30프레임
    expect(frames).toBeLessThanOrEqual(2 * (LOCK_RESET_LIMIT + 1) + LOCK_DELAY_FRAMES + 2);
  });
});

describe('지연 중 입력', () => {
  it('생성 지연 중 누른 하드드롭은 다음 블록에 적용된다', () => {
    const g = newGame();
    step(g, ACTION.HARD_DROP);
    expect(g.active).toBe(false);
    step(g, ACTION.HARD_DROP);
    for (let f = 0; f < SPAWN_DELAY_FRAMES && g.pieces < 2; f++) step(g);
    expect(g.pieces).toBe(2);
  });
});

describe('중력 표', () => {
  it('레벨이 오를수록 빨라진다 (정수)', () => {
    for (let i = 1; i < GRAVITY_TABLE.length; i++) {
      expect(Number.isInteger(GRAVITY_TABLE[i])).toBe(true);
      expect(GRAVITY_TABLE[i]).toBeGreaterThan(GRAVITY_TABLE[i - 1]);
    }
  });
});
