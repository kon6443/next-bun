// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/types/api';
import type { BattleMatch, BattleReplayDetail } from '@/services/tetrisBattleService';
import golden from '../../battle-engine/__fixtures__/golden-battle-replays.json';
import type { BattleReplayInput } from '../../battle-engine';

const getBattleMatch = vi.fn();
const getBattleReplay = vi.fn();
vi.mock('@/services/tetrisBattleService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/tetrisBattleService')>()),
  getBattleMatch: (...a: unknown[]) => getBattleMatch(...a),
  getBattleReplay: (...a: unknown[]) => getBattleReplay(...a),
}));

import { BattleMatchViewer } from './BattleMatchViewer';
import { clearBattleMatchCache } from '../lib/battleMatchLoader';

const MATCH_ID = 'oFDKsz2Gf-rpDFBa';
const survivor = (golden as unknown as { name: string; input: BattleReplayInput }[]).find((c) => c.name === 'survivor')!.input;
const base = { sent: 3, received: 1, pieces: 20, maxCombo: 2, frames: survivor.frames };
const match: BattleMatch = {
  matchId: MATCH_ID,
  roomName: '실연동 방',
  playerCount: 2,
  startedAt: '2026-10-22T06:52:32.841Z',
  endedAt: '2026-10-22T06:52:38.448Z',
  players: [
    { ...base, playerId: 'p1', name: '에이', place: 1, kos: 1, koReason: null, verdict: 'VERIFIED' },
    { ...base, playerId: 'p2', name: '비', place: 2, kos: 0, koReason: 'disconnect', verdict: 'MISSING' },
  ],
};
const replay: BattleReplayDetail = { ...survivor, matchId: MATCH_ID, playerId: 'p1' };

describe('대전 경기 페이지 (DESIGN §18)', () => {
  beforeEach(() => {
    getBattleMatch.mockReset();
    clearBattleMatchCache();
    getBattleReplay.mockReset();
  });

  it('결과표를 그리고, VERIFIED 참가자 리플레이만 받는다 — MISSING은 "기록 없음"', async () => {
    getBattleMatch.mockResolvedValue({ data: match });
    getBattleReplay.mockResolvedValue({ data: replay });
    render(<BattleMatchViewer matchId={MATCH_ID} />);

    expect(await screen.findByRole('table', { name: '경기 결과' })).toBeInTheDocument();
    expect(screen.getAllByText('에이').length).toBeGreaterThan(0);
    expect(screen.getByRole('region', { name: '2위 비' })).toHaveTextContent('기록 없음');
    await waitFor(() => expect(getBattleReplay).toHaveBeenCalledTimes(1));
    expect(getBattleReplay).toHaveBeenCalledWith(MATCH_ID, 'p1');
    // 받은 판은 "불러오는 중"이 사라진다
    await waitFor(() => expect(screen.getByRole('region', { name: '1위 에이' })).not.toHaveTextContent('기록을 불러오는 중'));
    expect(screen.getByRole('button', { name: '경기 공유' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: '재생 위치' })).toHaveAttribute('max', String(survivor.frames));
  });

  it('리플레이 404는 그 판만 "기록 없음"', async () => {
    getBattleMatch.mockResolvedValue({ data: { ...match, players: [match.players[0]] } });
    getBattleReplay.mockRejectedValue(new ApiError('TETRIS_BATTLE_REPLAY_NOT_FOUND', 'x', 404));
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    await waitFor(() => expect(screen.getByRole('region', { name: '1위 에이' })).toHaveTextContent('기록 없음'));
  });

  it('경기 404(숨김·DISPUTED·저장 전)는 공개되지 않은 경기 안내', async () => {
    getBattleMatch.mockRejectedValue(new ApiError('TETRIS_BATTLE_MATCH_NOT_FOUND', 'x', 404));
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    expect(await screen.findByText('공개되지 않은 경기예요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대전 로비로' })).toHaveAttribute('href', '/games/tetris/battle');
  });

  it('일시 실패(429)면 "다시 시도"로 다시 받는다', async () => {
    getBattleMatch.mockRejectedValueOnce(new ApiError('TOO_MANY_REQUESTS', 'x', 429)).mockResolvedValue({ data: match });
    getBattleReplay.mockResolvedValue({ data: replay });
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    (await screen.findByRole('button', { name: '다시 시도' })).click();
    expect(await screen.findByRole('table', { name: '경기 결과' })).toBeInTheDocument();
    expect(getBattleMatch).toHaveBeenCalledTimes(2);
  });

  it('형식이 아닌 matchId는 백엔드에 묻지 않고 같은 안내', () => {
    render(<BattleMatchViewer matchId="nope" />);
    expect(screen.getByText('공개되지 않은 경기예요')).toBeInTheDocument();
    expect(getBattleMatch).not.toHaveBeenCalled();
  });

  it('StrictMode 재마운트에도 경기·리플레이 조회는 한 번씩 (조회 스로틀 초당 3)', async () => {
    getBattleMatch.mockResolvedValue({ data: match });
    getBattleReplay.mockResolvedValue({ data: replay });
    render(
      <StrictMode>
        <BattleMatchViewer matchId={MATCH_ID} />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByRole('region', { name: '1위 에이' })).not.toHaveTextContent('기록을 불러오는 중'));
    expect(getBattleMatch).toHaveBeenCalledTimes(1);
    expect(getBattleReplay).toHaveBeenCalledTimes(1);
  });
});
