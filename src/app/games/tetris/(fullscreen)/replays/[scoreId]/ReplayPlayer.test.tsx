// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ApiError } from '@/types/api';
import golden from '../../../engine/__fixtures__/golden-replays.json';
import { ENGINE_VERSION, FRAMES_PER_SECOND } from '../../../engine';
import { formatFrames } from '@/app/games/_shared/lib/format';

const loadReplay = vi.fn();
vi.mock('@/app/games/_shared/lib/replayLoader', () => ({ loadReplay: (...a: unknown[]) => loadReplay(...a) }));
// 판은 그리지 않는다 — 재생 컨트롤만 본다
vi.mock('../../../components/TetrisCanvas', () => ({ TetrisCanvas: () => null }));
vi.mock('@/app/games/_shared/hooks/useKakaoReady', () => ({ useKakaoReady: () => ({ kakaoReady: false, kakaoScript: null }) }));

import ReplayPlayer from './ReplayPlayer';

type Case = { name: string; input: { seed: number; das: number; arr: number; frames: number; inputs: number[] } };
const replayOf = (name: string) => {
  const input = (golden as Case[]).find((c) => c.name === name)!.input;
  return { ...input, scoreId: 1, rank: 1, playerName: '테트', score: 100, lines: 4, level: 1, durationMs: 1, createdAt: '2026-10-23T00:00:00Z', engineVersion: ENGINE_VERSION };
};

async function ready(name = 'back-to-back') {
  loadReplay.mockResolvedValue(replayOf(name));
  render(<ReplayPlayer scoreId={1} />);
  return (await screen.findByTestId('tetris-replay-seek', {}, { timeout: 5000 })) as HTMLInputElement;
}

describe('싱글 리플레이 재생기 (games-polish P4)', () => {
  beforeEach(() => {
    loadReplay.mockReset();
  });

  it('하이라이트 — 4줄 순간이 막대 점·버튼으로, 다음을 누르면 그 순간 1.5초 앞으로', async () => {
    await ready();
    expect(screen.getByTestId('highlight-marks').children).toHaveLength(2);
    const next = screen.getByRole('button', { name: /^다음 하이라이트 — 테트리스 4줄 / });
    const at = /(\d+:\d+)$/.exec(next.getAttribute('aria-label')!)![1];
    fireEvent.click(next);
    const slider = screen.getByTestId('tetris-replay-seek') as HTMLInputElement;
    // 막대 값 = 하이라이트 순간 − 1.5초 → 표기는 그 순간보다 앞
    expect(Number(slider.value)).toBeGreaterThan(0);
    expect(formatFrames(Number(slider.value) + 1.5 * FRAMES_PER_SECOND)).toBe(at);
  });

  it('막대 이름에 시간 표기(aria-valuetext) — 프레임 수를 읽지 않게 (FE-26)', async () => {
    const slider = await ready();
    expect(slider.getAttribute('aria-valuetext')).toMatch(/^\d+:\d{2} \/ \d+:\d{2}$/);
  });

  it('막대를 끄는 동안은 재생을 멈추고 놓으면 이어서 — 재생이 손잡이를 되돌리지 않게 (FE-17)', async () => {
    const slider = await ready();
    expect(screen.getByRole('button', { name: '일시정지' })).toBeTruthy();
    fireEvent.pointerDown(slider);
    expect(screen.getByRole('button', { name: '재생' })).toBeTruthy();
    fireEvent.change(slider, { target: { value: '1200' } });
    expect(slider.value).toBe('1200');
    fireEvent.pointerUp(slider);
    expect(screen.getByRole('button', { name: '일시정지' })).toBeTruthy();
  });

  it('일시 실패면 "다시 시도"로 다시 받는다 — 없는 기록(404)은 버튼 없이 (FE-25)', async () => {
    loadReplay.mockRejectedValueOnce(new ApiError('TOO_MANY_REQUESTS', '요청이 너무 잦습니다.', 429)).mockResolvedValue(replayOf('line-clear-4'));
    render(<ReplayPlayer scoreId={1} />);
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    await act(async () => {
      fireEvent.click(retry);
    });
    expect(await screen.findByTestId('tetris-replay-seek', {}, { timeout: 5000 })).toBeTruthy();
    expect(loadReplay).toHaveBeenCalledTimes(2);
  });

  it('없는 기록은 다시 시도 버튼이 없다', async () => {
    loadReplay.mockRejectedValue(new ApiError('GAME_SCORE_NOT_FOUND', 'x', 404));
    render(<ReplayPlayer scoreId={1} />);
    expect(await screen.findByText('기록을 찾을 수 없어요.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });
});
