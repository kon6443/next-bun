// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ApiError } from '@/types/api';

const getBattleMatch = vi.fn();
vi.mock('@/services/tetrisBattleService', () => ({ getBattleMatch: (...a: unknown[]) => getBattleMatch(...a) }));

import { MatchRecordLinks } from './MatchRecordLinks';
import { clearBattleMatchCache } from '../lib/battleMatchLoader';

const MATCH_ID = 'oFDKsz2Gf-rpDFBa';
const match = { matchId: MATCH_ID, roomName: '방', playerCount: 2, startedAt: '', endedAt: '', players: [] };

describe('결과 화면 "기록 보기·공유" (DESIGN §18 진입점)', () => {
  beforeEach(() => {
    getBattleMatch.mockReset();
    clearBattleMatchCache();
  });

  it('경기가 저장되기 전에는 비활성 "경기 저장 중…"', () => {
    getBattleMatch.mockReturnValue(new Promise(() => {}));
    render(<MatchRecordLinks matchId={MATCH_ID} />);
    expect(screen.getByRole('status')).toHaveTextContent('경기 저장 중…');
    expect(screen.queryByRole('link', { name: /기록 보기/ })).toBeNull();
  });

  it('GET 200이면 기록 보기(새 탭 — 방 소켓 유지)·공유가 열린다', async () => {
    getBattleMatch.mockResolvedValue({ data: match });
    render(<MatchRecordLinks matchId={MATCH_ID} />);
    const link = await screen.findByRole('link', { name: /^기록 보기.*새 탭/ });
    expect(link).toHaveAttribute('href', `/games/tetris/battle/matches/${MATCH_ID}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: '공유' })).toBeInTheDocument();
  });

  it('다시 물어도 안 되는 실패면 안내만', async () => {
    getBattleMatch.mockRejectedValue(new ApiError('VALIDATION_ERROR', 'x', 422));
    render(<MatchRecordLinks matchId={MATCH_ID} />);
    expect(await screen.findByText('이 경기는 기록 보기를 열 수 없어요.')).toBeInTheDocument();
  });
});
