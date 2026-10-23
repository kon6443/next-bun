// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/types/api';
import { ENGINE_VERSION, OP, OP_ARG_COUNTS, TICKS_PER_SECOND, step } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { LOCAL_REPLAY_VERSION } from '../lib/localReplay';
import { LocalReplayView, ServerReplay } from './ReplayScreens';
import { ResultPanel } from './ResultPanel';

const loadReplay = vi.hoisted(() => vi.fn());
vi.mock('@/app/games/_shared/lib/replayLoader', () => ({ loadReplay }));
const linkAttrs = (rest: Record<string, unknown>) => Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'replace' && key !== 'scroll'));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...linkAttrs(rest)}>{children}</a> }));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

/** 봇이 이긴 캠페인 판 — 로컬 다시보기로 저장 */
function saveLocalWin(stageId = 's1') {
  const driver = GameDriver.fromBoard('campaign', stageId, 3);
  runGame(driver, greedyBot());
  const input = driver.toReplayInput();
  localStorage.setItem(
    `defense:replay:${stageId}`,
    JSON.stringify({ v: LOCAL_REPLAY_VERSION, engineVersion: ENGINE_VERSION, boardKey: stageId, difficulty: 'normal', seed: input.seed, ticks: input.ticks, inputs: input.inputs, stars: 3, livesLeft: driver.state.lives, savedAt: 1 }),
  );
  return { driver, input };
}

const fmt = (ticks: number) => {
  const total = Math.floor(ticks / TICKS_PER_SECOND);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

describe('리플레이 화면 — 로컬·서버', () => {
  beforeEach(() => {
    localStorage.clear();
    loadReplay.mockReset();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('로컬 다시보기 — 준비 뒤 재생기: 웨이브 눈금·배속·일시정지·탐색·명령 목록', { timeout: 30_000 }, async () => {
    const { driver, input } = saveLocalWin();
    render(<LocalReplayView stageId="s1" />);
    const player = await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    expect(player.getAttribute('aria-label')).toContain('스테이지 1 보통 다시보기');
    expect(screen.getAllByTestId('defense-replay-wave-mark')).toHaveLength(driver.state.wavesStarted);
    expect(screen.getByTestId('defense-replay-time').textContent).toContain(`/ ${fmt(input.ticks)}`);
    fireEvent.click(screen.getByTestId('defense-replay-speed-4'));
    expect(screen.getByTestId('defense-replay-speed-4').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('defense-replay-play'));
    expect(screen.getByTestId('defense-replay-play').getAttribute('aria-pressed')).toBe('false');
    // 탐색 — 끝으로 가면 끝난 판(웨이브 전부)
    // 막대 끌기는 다음 프레임에 한 번 탐색 — 막대 끝(1초 단위로 올림)이면 끝난 틱으로 잘린다
    fireEvent.change(screen.getByTestId('defense-replay-seek'), { target: { value: String(Math.ceil(input.ticks / TICKS_PER_SECOND) * TICKS_PER_SECOND) } });
    await waitFor(() => expect(screen.getByTestId('defense-replay-time').textContent).toBe(`${fmt(input.ticks)} / ${fmt(input.ticks)}`));
    expect(screen.getByTestId('defense-replay-wave').textContent).toBe(String(driver.state.wavesStarted));
    // 명령 목록에서 누르면 그 틱으로(그 틱의 명령까지 적용된 상태)
    fireEvent.click(screen.getByTestId('defense-replay-commands-toggle'));
    const first = screen.getByTestId('defense-replay-command-0');
    fireEvent.click(first);
    expect(screen.getByTestId('defense-replay-time').textContent!.startsWith(first.querySelector('span')!.textContent!)).toBe(true);
    expect(Number(screen.getByTestId('defense-replay-wave').textContent)).toBeLessThanOrEqual(1);
    // 슬롯 명령을 고르면 그 슬롯을 강조(이미 적용된 명령이라 재생 강조가 오지 않는 경우)
    const slotCommand = screen.getAllByRole('button').find((b) => /슬롯 \d+/.test(b.textContent ?? '') && b.dataset.testid?.startsWith('defense-replay-command-'))!;
    fireEvent.click(slotCommand);
    expect(screen.getByTestId('defense-replay-highlight').dataset.slot).toBe(String(Number(/슬롯 (\d+)/.exec(slotCommand.textContent!)![1]) - 1));
    // Space로 재생/일시정지
    fireEvent.keyDown(window, { code: 'Space', key: ' ' });
    expect(screen.getByTestId('defense-replay-play').getAttribute('aria-pressed')).toBe('true');
  });

  it('로컬 다시보기가 없으면 안내', async () => {
    render(<LocalReplayView stageId="s2" />);
    expect((await screen.findByTestId('defense-replay-error')).textContent).toContain('저장된 다시보기가 없어요');
  });

  it('서버 기록 — 보드 표기·기록자·"웨이브 n · 진척 p%", 깨진 기록·없는 기록(진행 중 주간)·재생할 수 없는 버전은 안내', async () => {
    // 짧은 무한 판 — 타워 없이 카운트다운마다 호출해 금방 진다
    const driver = GameDriver.fromBoard('endless', 'endless-s1', 5);
    driver.must(OP.CALL_WAVE);
    while (!driver.state.over) {
      if (driver.state.countdown > 0) driver.command(OP.CALL_WAVE);
      step(driver.state);
    }
    const input = driver.toReplayInput();
    const data = { rank: 2, scoreId: 46, playerName: '수비왕', boardKey: 'endless-s1', score: 7_250_000, detail: { wave: 7 }, durationMs: 1, createdAt: 'x', engineVersion: ENGINE_VERSION, seed: input.seed, frames: input.ticks, inputs: input.inputs, params: {} };
    loadReplay.mockResolvedValue(data);
    const { unmount } = render(<ServerReplay scoreId={46} />);
    const player = await screen.findByTestId('defense-replay', {}, { timeout: 8000 });
    expect(player.getAttribute('aria-label')).toBe('무한 모드 시즌 1 리플레이');
    expect(screen.getByText('수비왕 · 웨이브 7 · 진척 25% · 2위')).toBeTruthy();
    unmount();

    loadReplay.mockResolvedValue({ ...data, frames: data.frames + 1 });
    const second = render(<ServerReplay scoreId={46} />);
    expect((await screen.findByTestId('defense-replay-error', {}, { timeout: 8000 })).textContent).toContain('손상된 기록');
    second.unmount();

    loadReplay.mockRejectedValue(new ApiError('GAME_SCORE_NOT_FOUND', '기록을 찾을 수 없습니다.', 404));
    const third = render(<ServerReplay scoreId={47} />);
    expect((await screen.findByTestId('defense-replay-error')).textContent).toContain('주가 끝나고 4시간 뒤에 공개');
    third.unmount();

    loadReplay.mockResolvedValue({ ...data, engineVersion: ENGINE_VERSION + 1 });
    render(<ServerReplay scoreId={46} />);
    expect((await screen.findByTestId('defense-replay-error')).textContent).toContain('지금 버전의 게임으로 재생할 수 없어요');
  }, 30_000);

  it('캠페인 결과 — 다시보기로 저장되면 로컬 재생기 링크', () => {
    const result = { victory: true, livesLeft: 18, endTick: 900, leakedLivesByEnemy: [], worstWave: 0, inputs: [] };
    render(<ResultPanel result={result} stars={3} replaySaved progressSaved nextHref={null} replayHref="/games/defense/replays/local/s1" exitHref="/x" onRetry={() => {}} />);
    expect(screen.getByTestId('defense-local-replay').getAttribute('href')).toBe('/games/defense/replays/local/s1');
  });

  it('재생하면 명령 순간 그 슬롯을 강조한다', { timeout: 30_000 }, async () => {
    const { input } = saveLocalWin();
    // 1초 넘어서 나오는 첫 슬롯 명령(건설·업그레이드 등) — 그 1초 전으로 탐색해 재생
    let tick = 0;
    let target: { tick: number; slot: number } | null = null;
    for (let i = 0; i < input.inputs.length && !target; ) {
      tick += input.inputs[i];
      const op = input.inputs[i + 1];
      const count = OP_ARG_COUNTS[op];
      if (op !== OP.CALL_WAVE && op !== OP.PICK_AUGMENT && tick > 2 * TICKS_PER_SECOND) target = { tick, slot: input.inputs[i + 2] };
      i += 2 + count;
    }
    expect(target).not.toBeNull();
    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    fireEvent.change(screen.getByTestId('defense-replay-seek'), { target: { value: String(Math.floor((target!.tick - 1) / TICKS_PER_SECOND) * TICKS_PER_SECOND) } });
    fireEvent.click(screen.getByTestId('defense-replay-speed-2'));
    const ring = await screen.findByTestId('defense-replay-highlight', {}, { timeout: 3000 });
    expect(Number(ring.dataset.slot)).toBe(target!.slot);
    await act(async () => {});
  });
});
