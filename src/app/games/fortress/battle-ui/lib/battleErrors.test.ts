import { describe, expect, it } from 'vitest';
import { FortressErrorCodes } from '@/types/fortressSocket';
import { battleErrorMessage } from './battleErrors';

describe('포트리스 대전 오류 안내', () => {
  it('시작 전 제출(MATCH_NOT_STARTED)은 카운트다운 안내 — 일반 오류 문구로 뭉개지 않는다', () => {
    expect(battleErrorMessage(FortressErrorCodes.MATCH_NOT_STARTED)).toBe('아직 시작 전이에요. 카운트다운이 끝나면 쏘세요.');
  });
});
