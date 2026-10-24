// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/types/api';
import { ENGINE_VERSION, OP, OP_ARG_COUNTS, TICKS_PER_SECOND, step } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { LOCAL_REPLAY_VERSION } from '../lib/localReplay';
import * as engine from '../engine';
import { type PreparedReplay, prepareReplay } from '../lib/replayRunner';
import { LocalReplayView, ServerReplay } from './ReplayScreens';
import { ResultPanel } from './ResultPanel';

const loadReplay = vi.hoisted(() => vi.fn());
vi.mock('@/app/games/_shared/lib/replayLoader', () => ({ loadReplay }));
// 조회 기록·시청 보고는 훅 테스트(useReplayStats)가 맡는다 — 여기서는 화면이 넘기는 값만
const stats = vi.hoisted(() => ({ recorded: null as number | null, addWatched: vi.fn(), viewCalls: [] as unknown[][] }));
vi.mock('@/app/games/_shared/hooks/useReplayStats', async (importActual) => ({
  ...(await importActual<typeof import('@/app/games/_shared/hooks/useReplayStats')>()),
  useRecordedViewCount: (...args: unknown[]) => {
    stats.viewCalls.push(args);
    return stats.recorded;
  },
  useReplayWatchReport: () => stats.addWatched,
}));
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
    stats.recorded = null;
    stats.addWatched.mockReset();
    stats.viewCalls = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    // 가짜 타이머를 쓰는 테스트가 중간에 실패해도 다음 테스트로 새지 않게
    vi.useRealTimers();
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
    // 조회수 — 좁은 화면에서 기록 줄만 말줄임되고 조회수는 따로 남는다, 응답에 없으면 0 (replay-views)
    expect(screen.getByText('· 조회 0')).toBeTruthy();
    unmount();

    // 재생 준비가 끝난 뒤에만 조회로 센다 (replay-views)
    expect(stats.viewCalls.at(-1)).toEqual(['defense', 46, true]);

    stats.viewCalls = [];
    loadReplay.mockResolvedValue({ ...data, frames: data.frames + 1 });
    const second = render(<ServerReplay scoreId={46} />);
    expect((await screen.findByTestId('defense-replay-error', {}, { timeout: 8000 })).textContent).toContain('손상된 기록');
    // 손상된 기록은 조회로 세지 않는다
    expect(stats.viewCalls.every(([, , playable]) => playable === false)).toBe(true);
    second.unmount();

    loadReplay.mockRejectedValue(new ApiError('GAME_SCORE_NOT_FOUND', '기록을 찾을 수 없습니다.', 404));
    const third = render(<ServerReplay scoreId={47} />);
    expect((await screen.findByTestId('defense-replay-error')).textContent).toContain('주가 끝나고 4시간 뒤에 공개');
    third.unmount();

    loadReplay.mockResolvedValue({ ...data, engineVersion: ENGINE_VERSION + 1 });
    render(<ServerReplay scoreId={46} />);
    expect((await screen.findByTestId('defense-replay-error')).textContent).toContain('지금 버전의 게임으로 재생할 수 없어요');
  }, 30_000);

  it('재생 중에 막대를 끝으로 끌면 멈춘 상태가 된다 — "Ⅱ"인 채 서 있지 않고 ▶ 한 번이면 처음부터 (games-polish FE-38)', { timeout: 30_000 }, async () => {
    const { input } = saveLocalWin();
    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    const play = screen.getByTestId('defense-replay-play');
    expect(play.getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByTestId('defense-replay-seek'), { target: { value: String(Math.ceil(input.ticks / TICKS_PER_SECOND) * TICKS_PER_SECOND) } });
    await waitFor(() => expect(screen.getByTestId('defense-replay-time').textContent).toBe(`${fmt(input.ticks)} / ${fmt(input.ticks)}`));
    expect(play.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(play);
    expect(play.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('defense-replay-time').textContent!.startsWith('0:00')).toBe(true);
  });

  it('하이라이트 — 목숨을 잃은 순간이 막대 점·버튼으로, 다음을 누르면 그 순간 1.5초 앞으로 (games-polish P4)', async () => {
    const driver = GameDriver.fromBoard('endless', 'endless-s1', 5);
    driver.must(OP.CALL_WAVE);
    while (!driver.state.over) {
      if (driver.state.countdown > 0) driver.command(OP.CALL_WAVE);
      step(driver.state);
    }
    const input = driver.toReplayInput();
    const prepared = (await prepareReplay(engine, { mode: 'endless', boardKey: 'endless-s1', seed: input.seed, ticks: input.ticks, inputs: input.inputs })) as PreparedReplay;
    const first = prepared.highlights[0];
    expect(first.kind).toBe('leak');
    loadReplay.mockResolvedValue({ rank: 2, scoreId: 48, playerName: '수비왕', boardKey: 'endless-s1', score: 1, detail: { wave: 7 }, durationMs: 1, createdAt: 'x', engineVersion: ENGINE_VERSION, seed: input.seed, frames: input.ticks, inputs: input.inputs, params: {} });
    render(<ServerReplay scoreId={48} />);
    await screen.findByTestId('defense-replay', {}, { timeout: 8000 });
    expect(screen.getByTestId('highlight-marks').children).toHaveLength(prepared.highlights.length);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^다음 하이라이트 — 목숨 잃음 ${first.detail} ${fmt(first.at)}$`) }));
    expect(screen.getByTestId('defense-replay-time').textContent!.startsWith(fmt(Math.max(0, first.at - 1.5 * TICKS_PER_SECOND)))).toBe(true);
  }, 30_000);

  it('서버 기록을 일시 실패로 못 받으면 "다시 시도"로 다시 받는다 — 없는 기록(404)은 버튼 없이 (games-polish FE-25)', async () => {
    loadReplay.mockRejectedValueOnce(new ApiError('TOO_MANY_REQUESTS', '요청이 너무 잦습니다.', 429)).mockRejectedValueOnce(new ApiError('GAME_SCORE_NOT_FOUND', 'x', 404));
    render(<ServerReplay scoreId={49} />);
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    await act(async () => {
      fireEvent.click(retry);
    });
    expect((await screen.findByTestId('defense-replay-error')).textContent).toContain('기록을 찾을 수 없어요');
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
    expect(loadReplay).toHaveBeenCalledTimes(2);
  });

  it('캠페인 결과는 대화상자 — 첫 동작에 포커스, Tab은 안에서 돈다, Esc로 닫히지 않는다 (games-polish FE-42)', () => {
    const result = { victory: false, livesLeft: 0, endTick: 900, leakedLivesByEnemy: [], worstWave: 0, inputs: [] };
    const onRetry = vi.fn();
    render(<ResultPanel result={result} stars={0} replaySaved={false} progressSaved nextHref={null} exitHref="/x" onRetry={onRetry} />);
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
    expect(dialog.contains(document.activeElement)).toBe(true);
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

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

  it('재생 중 웨이브 표시는 바뀐 순간 갱신된다 — 1초 단위 시간 표시를 기다리지 않는다 (games-polish FE-41)', { timeout: 30_000 }, async () => {
    saveLocalWin();
    // 같은 seed·봇으로 다시 돌려 웨이브 수가 초 중간에 바뀌는 틱을 찾는다
    const changes: { tick: number; waves: number }[] = [];
    let last = 0;
    const probe = GameDriver.fromBoard('campaign', 's1', 3);
    runGame(probe, greedyBot(), (d) => {
      if (d.state.wavesStarted !== last) {
        last = d.state.wavesStarted;
        changes.push({ tick: d.state.tick, waves: last });
      }
      return false;
    });
    const change = changes.find((c) => c.tick > TICKS_PER_SECOND && c.tick % TICKS_PER_SECOND >= 5 && c.tick % TICKS_PER_SECOND <= TICKS_PER_SECOND - 10)!;
    expect(change).toBeDefined();
    // 재생 루프(rAF)가 처음부터 가짜 시계로 돌게 렌더 전에 — 준비(setTimeout)는 진짜 시계
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    const second = Math.floor(change.tick / TICKS_PER_SECOND) * TICKS_PER_SECOND;
    fireEvent.change(screen.getByTestId('defense-replay-seek'), { target: { value: String(second) } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32); // 다음 프레임에 탐색
    });
    expect(Number(screen.getByTestId('defense-replay-wave').textContent)).toBe(change.waves - 1);
    // 바뀐 틱 + 3틱까지 — 다음 초 경계 전
    const ms = ((change.tick - second + 3) * 1000) / TICKS_PER_SECOND;
    await act(async () => {
      for (let t = 0; t < ms; t += 16) await vi.advanceTimersByTimeAsync(16);
    });
    expect(screen.getByTestId('defense-replay-time').textContent!.startsWith(fmt(second))).toBe(true);
    expect(Number(screen.getByTestId('defense-replay-wave').textContent)).toBe(change.waves);
    vi.useRealTimers();
  });

  it('서버 기록 시청 시간 — 재생 중에만 실제 경과 ms를 넘긴다, 로컬 다시보기는 넘기지 않는다 (replay-views)', { timeout: 30_000 }, async () => {
    saveLocalWin();
    // 서버 기록은 무한 판 — 타워 없이 카운트다운마다 호출해 금방 진다
    const driver = GameDriver.fromBoard('endless', 'endless-s1', 5);
    driver.must(OP.CALL_WAVE);
    while (!driver.state.over) {
      if (driver.state.countdown > 0) driver.command(OP.CALL_WAVE);
      step(driver.state);
    }
    const input = driver.toReplayInput();
    stats.recorded = 1234;
    loadReplay.mockResolvedValue({ rank: 1, scoreId: 50, playerName: '수비왕', boardKey: 'endless-s1', score: 1, detail: { wave: 1 }, durationMs: 1, createdAt: 'x', viewCount: 3, engineVersion: ENGINE_VERSION, seed: input.seed, frames: input.ticks, inputs: input.inputs, params: {} });
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { unmount } = render(<ServerReplay scoreId={50} />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    // 조회 기록 응답(1,234)과 재생 응답(3) 중 큰 값
    expect(screen.getByText('· 조회 1,234')).toBeTruthy();
    // 4배속이어도 시청 시간은 벽시계 — 배속을 곱한 값을 넘기지 않는다 (Opus 리뷰 S2)
    fireEvent.click(screen.getByTestId('defense-replay-speed-4'));
    await act(async () => {
      for (let t = 0; t < 160; t += 16) await vi.advanceTimersByTimeAsync(16);
    });
    const watched = stats.addWatched.mock.calls.reduce((sum, [ms]) => sum + (ms as number), 0);
    expect(watched).toBeGreaterThan(100);
    expect(watched).toBeLessThanOrEqual(160);

    fireEvent.click(screen.getByTestId('defense-replay-play'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });
    stats.addWatched.mockClear();
    await act(async () => {
      for (let t = 0; t < 160; t += 16) await vi.advanceTimersByTimeAsync(16);
    });
    expect(stats.addWatched).not.toHaveBeenCalled();
    unmount();

    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    await act(async () => {
      for (let t = 0; t < 160; t += 16) await vi.advanceTimersByTimeAsync(16);
    });
    expect(stats.addWatched).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
