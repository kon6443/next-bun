import { describe, it, expect } from 'vitest';
import * as fortress from '@/types/fortressSocket';
import * as tetris from '@/types/tetrisBattleSocket';
import {
  BATTLE_EMOTE_IDS,
  CHAT_TEXT_MAX_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_MIN_PLAYERS,
  ROOM_NAME_MAX_LENGTH,
  ROOM_PASSWORD_MAX_LENGTH,
  ROOM_PASSWORD_MIN_LENGTH,
  RoomClientEvents,
  RoomErrorCodes,
  RoomServerEvents,
} from './roomContract';

/** 공용 방 코어가 보내고 받는 이름·코드·한도가 두 게임 계약 사본과 같다 — 한쪽 계약이 바뀌면 여기서 먼저 깨진다 */
describe('대전 방 공통 계약 = 테트리스·포트리스 계약 사본', () => {
  const games = [
    { name: 'tetris', client: tetris.TetrisBattleClientEvents, server: tetris.TetrisBattleServerEvents, codes: tetris.TetrisBattleErrorCodes, mod: tetris, emotes: tetris.TETRIS_BATTLE_EMOTE_IDS },
    { name: 'fortress', client: fortress.FortressClientEvents, server: fortress.FortressServerEvents, codes: fortress.FortressErrorCodes, mod: fortress, emotes: fortress.FORTRESS_EMOTE_IDS },
  ];

  it.each(games)('$name — 방 코어 이벤트명이 같다', ({ client, server }) => {
    for (const [key, value] of Object.entries(RoomClientEvents)) expect((client as Record<string, string>)[key]).toBe(value);
    for (const [key, value] of Object.entries(RoomServerEvents)) expect((server as Record<string, string>)[key]).toBe(value);
  });

  it.each(games)('$name — 공통 에러 코드가 모두 있다', ({ codes }) => {
    for (const [key, value] of Object.entries(RoomErrorCodes)) expect((codes as Record<string, string>)[key]).toBe(value);
  });

  it.each(games)('$name — 입력 한도·방 코드·이모트가 같다', ({ mod, emotes }) => {
    expect(mod.ROOM_CODE_LENGTH).toBe(ROOM_CODE_LENGTH);
    expect(mod.ROOM_CODE_ALPHABET).toBe(ROOM_CODE_ALPHABET);
    expect(mod.ROOM_MIN_PLAYERS).toBe(ROOM_MIN_PLAYERS);
    expect(mod.ROOM_NAME_MAX_LENGTH).toBe(ROOM_NAME_MAX_LENGTH);
    expect(mod.ROOM_PASSWORD_MIN_LENGTH).toBe(ROOM_PASSWORD_MIN_LENGTH);
    expect(mod.ROOM_PASSWORD_MAX_LENGTH).toBe(ROOM_PASSWORD_MAX_LENGTH);
    expect(mod.CHAT_TEXT_MAX_LENGTH).toBe(CHAT_TEXT_MAX_LENGTH);
    expect([...emotes]).toEqual([...BATTLE_EMOTE_IDS]);
  });
});
