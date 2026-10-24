// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const fire = vi.fn();
vi.mock('../hooks/useAttackTrails', () => ({ useAttackTrails: () => ({ rootRef: { current: null }, fire }) }));
const sound = { playCues: vi.fn(), play: vi.fn(), setMusicPlaying: vi.fn(), unlock: vi.fn() };
vi.mock('../../lib/sound/soundPlayer', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/sound/soundPlayer')>()),
  getSoundPlayer: () => sound,
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
  disputed: false,
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

  it('판을 누르면 그 판만 크게, 재생 컨트롤은 그대로 — 돌아가기로 원래 배치와 포커스 (FE-28)', async () => {
    getBattleMatch.mockResolvedValue({ data: match });
    getBattleReplay.mockResolvedValue({ data: replay });
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    const board = await screen.findByRole('button', { name: '에이 화면 크게 보기' });
    fireEvent.click(board);
    expect(screen.getByRole('region', { name: '2위 비' })).toHaveClass('hidden');
    expect(screen.getByRole('slider', { name: '재생 위치' })).toBeInTheDocument();
    const back = screen.getByRole('button', { name: '← 모든 판 보기' });
    expect(back).toHaveFocus();
    fireEvent.click(back);
    expect(screen.getByRole('region', { name: '2위 비' })).not.toHaveClass('hidden');
    expect(screen.getByRole('button', { name: '에이 화면 크게 보기' })).toHaveFocus();
  });

  it('재생 중 화면 상태(시간·슬라이더)는 몇 프레임마다만 갱신한다 — 매 화면 프레임 전체 재렌더를 피한다 (FE-06)', async () => {
    let frame: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frame = fn;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    try {
      getBattleMatch.mockResolvedValue({ data: match });
      getBattleReplay.mockResolvedValue({ data: replay });
      render(<BattleMatchViewer matchId={MATCH_ID} />);
      await waitFor(() => expect(screen.getByRole('button', { name: '일시정지' })).toBeEnabled());
      const slider = screen.getByRole('slider', { name: '재생 위치' });
      let t = 1000;
      const step = (ms: number) => act(() => frame?.((t += ms)));
      step(0);
      step(17);
      expect(slider).toHaveValue('0');
      for (let i = 0; i < 6; i++) step(17);
      expect(Number((slider as HTMLInputElement).value)).toBeGreaterThanOrEqual(6);
      // 갱신 간격 사이에서 멈추면 화면 시간을 판의 실제 프레임에 맞춘다
      step(17);
      step(17);
      const shown = Number((slider as HTMLInputElement).value);
      fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
      expect(Number((slider as HTMLInputElement).value)).toBeGreaterThan(shown);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('리플레이 404는 그 판만 "기록 없음"', async () => {
    getBattleMatch.mockResolvedValue({ data: { ...match, players: [match.players[0]] } });
    getBattleReplay.mockRejectedValue(new ApiError('TETRIS_BATTLE_REPLAY_NOT_FOUND', 'x', 404));
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    await waitFor(() => expect(screen.getByRole('region', { name: '1위 에이' })).toHaveTextContent('기록 없음'));
  });

  it('검증 실패(INVALID) 참가자는 결과표에 표시하고 리플레이를 받지 않으며 재생 판은 안내만 (D-008)', async () => {
    const disputed: BattleMatch = {
      ...match,
      players: [match.players[0], { ...match.players[1], koReason: 'topout', verdict: 'INVALID' }],
      disputed: true,
    };
    getBattleMatch.mockResolvedValue({ data: disputed });
    getBattleReplay.mockResolvedValue({ data: replay });
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    const table = await screen.findByRole('table', { name: '경기 결과' });
    expect(table).toHaveTextContent('검증 실패');
    expect(screen.getByRole('note')).toHaveTextContent('검증되지 않은 기록이 있어');
    expect(screen.getByRole('region', { name: '2위 비' })).toHaveTextContent('검증되지 않은 기록이라 재생하지 않아요');
    await waitFor(() => expect(getBattleReplay).toHaveBeenCalledTimes(1));
    expect(getBattleReplay).toHaveBeenCalledWith(MATCH_ID, 'p1');
  });

  it('경기 404(숨김·저장 전)는 공개되지 않은 경기 안내', async () => {
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

  it('판 하나만 기록을 못 받으면(일시 실패) 그 판의 "다시 받기"로 그 판만 다시 받는다 — 경기는 다시 묻지 않는다 (FE-23)', async () => {
    getBattleMatch.mockResolvedValue({ data: { ...match, players: [match.players[0]] } });
    getBattleReplay.mockRejectedValueOnce(new ApiError('FORBIDDEN', 'x', 403)).mockResolvedValue({ data: replay });
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    const board = await screen.findByRole('region', { name: '1위 에이' });
    await waitFor(() => expect(board).toHaveTextContent('기록을 불러오지 못했어요'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '에이 기록 다시 받기' }));
    });
    await waitFor(() => expect(board).not.toHaveTextContent('기록을 불러오지 못했어요'));
    expect(screen.queryByRole('button', { name: '에이 기록 다시 받기' })).toBeNull();
    expect(getBattleReplay).toHaveBeenCalledTimes(2);
    expect(getBattleMatch).toHaveBeenCalledTimes(1);
  });

  it('하이라이트 — 기록이 없는 판도 서버 요약의 KO를 찍고(이름 포함), 막대는 시간으로 읽힌다 (games-polish P4·FE-26)', async () => {
    getBattleMatch.mockResolvedValue({ data: match });
    getBattleReplay.mockResolvedValue({ data: replay });
    render(<BattleMatchViewer matchId={MATCH_ID} />);
    const slider = await screen.findByTestId('battle-replay-seek');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^\d+:\d{2} \/ \d+:\d{2}$/);
    // p2는 기록 없음(MISSING)·끊김 KO — 서버 frames에 KO 점
    const next = await screen.findByRole('button', { name: /^다음 하이라이트 — KO 비 / });
    expect(next).toBeTruthy();
    expect(screen.getByRole('list', { name: '하이라이트 종류' }).textContent).toContain('KO');
  });

  describe('다시보기 연출 — 소리·공격 궤적 (games-polish P7)', () => {
    // survivor 기록: 300프레임에 2줄 가비지 도착 · 1200프레임에 끝(비는 그때 연결 끊김 KO)
    const GARBAGE_AT = 300;
    let frame: FrameRequestCallback | null = null;
    let t = 1000;
    const step = (ms = 17) => act(() => frame?.((t += ms)));
    const seekTo = (value: number) => {
      fireEvent.change(screen.getByRole('slider', { name: '재생 위치' }), { target: { value: String(value) } });
      step(0);
    };

    beforeEach(() => {
      fire.mockReset();
      Object.values(sound).forEach((fn) => fn.mockReset());
      vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
        frame = fn;
        return 1;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
    });
    afterEach(() => vi.unstubAllGlobals());

    async function open(garbageFrom?: (string | null)[]) {
      getBattleMatch.mockResolvedValue({ data: match });
      getBattleReplay.mockResolvedValue({ data: { ...replay, garbageFrom } });
      render(<BattleMatchViewer matchId={MATCH_ID} />);
      await waitFor(() => expect(screen.getByRole('button', { name: '일시정지' })).toBeEnabled());
      step(0);
    }

    it('받은 가비지마다 보낸 판 → 받은 판 궤적, 탐색으로 건너뛴 가비지는 날리지 않는다', async () => {
      await open(['p2']);
      expect(sound.setMusicPlaying).toHaveBeenLastCalledWith(true);
      seekTo(GARBAGE_AT + 20);
      seekTo(GARBAGE_AT - 20);
      expect(fire).not.toHaveBeenCalled();
      for (let i = 0; i < 40; i++) step();
      expect(fire).toHaveBeenCalledTimes(1);
      expect(fire).toHaveBeenCalledWith('p2', 'p1', 2);
    });

    it('보낸 사람을 모르는 옛 경기는 궤적 없이 "+N"만', async () => {
      await open();
      seekTo(GARBAGE_AT - 20);
      for (let i = 0; i < 40; i++) step();
      expect(fire).not.toHaveBeenCalled();
      expect(screen.getByRole('region', { name: '1위 에이' })).toHaveTextContent('+2');
    });

    it('크게 보기 중이면 보낸 판이 숨어 있어 궤적 없이 "+N"만', async () => {
      await open(['p2']);
      fireEvent.click(screen.getByRole('button', { name: '에이 화면 크게 보기' }));
      seekTo(GARBAGE_AT - 20);
      for (let i = 0; i < 40; i++) step();
      expect(fire).not.toHaveBeenCalled();
      expect(screen.getByRole('region', { name: '1위 에이' })).toHaveTextContent('+2');
    });

    it('소리는 1위 판 신호만, 탈락한 판이 있으면 ko — 끝 근처로 탐색해도 건너뛴 소리는 몰려 나지 않는다', async () => {
      await open(['p2']);
      seekTo(survivor.frames - 30);
      expect(sound.playCues).not.toHaveBeenCalled();
      for (let i = 0; i < 40; i++) step();
      const largest = Math.max(0, ...sound.playCues.mock.calls.map(([cues]) => (cues as unknown[]).length));
      expect(largest).toBeLessThanOrEqual(5);
      expect(sound.play).toHaveBeenCalledWith({ kind: 'ko' });
    });
  });
});
