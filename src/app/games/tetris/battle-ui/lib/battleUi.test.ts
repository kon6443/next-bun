import { describe, expect, it } from 'vitest';
import { BOARD_BASE64_LENGTH, BOARD_BYTES, TetrisBattleErrorCodes } from '@/types/tetrisBattleSocket';
import { BOARD_ROWS, BOARD_WIDTH } from '../../engine';
import { battleErrorMessage } from './battleErrors';
import { decodeBoard, encodeBoard } from './boardCodec';
import { isValidMaxPlayers, normalizeChatText, normalizeRoomCode, validateRoomName, validateRoomPassword } from './roomForm';
import { createFakeOpponents, stepFakeOpponents } from './fakeOpponents';

describe('판 인코딩 (DESIGN §16)', () => {
  it('보이는 20행(20~39)만 위→아래·왼→오 칸당 1바이트 → base64 268자, 되돌리면 같다', () => {
    const board = new Uint8Array(BOARD_ROWS * BOARD_WIDTH);
    board[19 * BOARD_WIDTH + 3] = 5; // 숨은 줄 — 보내지 않는다
    board[20 * BOARD_WIDTH] = 1; // 보이는 첫 칸 → 바이트 0
    board[39 * BOARD_WIDTH + 9] = 8; // 맨 아래 오른쪽 가비지 → 바이트 199
    const encoded = encodeBoard(board);
    expect(encoded).toHaveLength(BOARD_BASE64_LENGTH);
    const cells = decodeBoard(encoded);
    expect(cells).toHaveLength(BOARD_BYTES);
    expect(cells?.[0]).toBe(1);
    expect(cells?.[BOARD_BYTES - 1]).toBe(8);
    expect(cells?.reduce((sum, v) => sum + v, 0)).toBe(9);
  });

  it('길이·base64·칸 값(0~8)이 틀리면 null', () => {
    expect(decodeBoard('')).toBeNull();
    expect(decodeBoard('A'.repeat(BOARD_BASE64_LENGTH - 4))).toBeNull();
    expect(decodeBoard('!'.repeat(BOARD_BASE64_LENGTH))).toBeNull();
    const bad = new Uint8Array(BOARD_BYTES).fill(9);
    expect(decodeBoard(btoa(String.fromCharCode(...bad)))).toBeNull();
  });
});

describe('방 입력값 (계약 상수와 같은 기준)', () => {
  it('방 이름: 정리 후 1~20자, 제어문자 금지', () => {
    expect(validateRoomName('  친구들   모여라 ')).toBeNull();
    expect(validateRoomName('   ')).not.toBeNull();
    expect(validateRoomName('가'.repeat(21))).not.toBeNull();
    expect(validateRoomName('가'.repeat(20))).toBeNull();
    expect(validateRoomName('a\u0007b')).not.toBeNull();
  });

  it('비밀번호: 비우면 없음, 있으면 1~20자', () => {
    expect(validateRoomPassword('')).toBeNull();
    expect(validateRoomPassword('1234')).toBeNull();
    expect(validateRoomPassword('x'.repeat(21))).not.toBeNull();
  });

  it('인원 2~4 정수', () => {
    expect([1, 2, 3, 4, 5, 2.5].map(isValidMaxPlayers)).toEqual([false, true, true, true, false, false]);
  });

  it('방 코드: 대문자로 바꾸고 6자·허용 문자(0·O·1·I·L 제외)만', () => {
    expect(normalizeRoomCode(' abc234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ABC23')).toBeNull();
    expect(normalizeRoomCode('ABC230')).toBeNull();
    expect(normalizeRoomCode('ABCDEL')).toBeNull();
  });

  it('채팅: 앞뒤 공백 제거, 비었거나 100자 넘으면 null', () => {
    expect(normalizeChatText('  안녕 ')).toBe('안녕');
    expect(normalizeChatText('   ')).toBeNull();
    expect(normalizeChatText('가'.repeat(101))).toBeNull();
  });
});

describe('에러 안내', () => {
  it('계약의 모든 에러 코드에 한국어 안내가 있다(일반 문구로 빠지지 않는다)', () => {
    const generic = battleErrorMessage('UNKNOWN_CODE');
    for (const code of Object.values(TetrisBattleErrorCodes)) {
      if (code === 'INTERNAL_ERROR') continue;
      expect(battleErrorMessage(code)).not.toBe(generic);
    }
    expect(battleErrorMessage('TIMEOUT')).not.toBe(generic);
    expect(battleErrorMessage('DISCONNECTED')).not.toBe(generic);
  });
});

describe('가짜 상대 (미리보기)', () => {
  it('같은 시드면 같은 판으로 진행하고 결국 끝난다', () => {
    const run = () => {
      const bots = createFakeOpponents(7, ['a', 'b']);
      for (let f = 0; f < 20000 && bots.some((b) => !b.bs.game.over); f++) stepFakeOpponents(bots, () => {});
      return bots.map((b) => [b.bs.game.over, b.bs.game.pieces, b.bs.game.frame]);
    };
    const first = run();
    expect(first.every(([over]) => over === true)).toBe(true);
    expect(run()).toEqual(first);
  });
});
