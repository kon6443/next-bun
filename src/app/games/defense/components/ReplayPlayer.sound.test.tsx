// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ENGINE_VERSION, OP, TICKS_PER_SECOND } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { SOUND } from '../audio/sfx';

import { commandSound } from '../hooks/useDefenseSfx';
import { LOCAL_REPLAY_VERSION } from '../lib/localReplay';
import { loadSettings, updateSettings } from '../lib/settings';
import { LocalReplayView } from './ReplayScreens';

const sfx = vi.hoisted(() => ({ play: vi.fn(), setSpeed: vi.fn(), setPaused: vi.fn(), setEnabled: vi.fn() }));
const useDefenseSfx = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useDefenseSfx', async (importActual) => ({
  ...(await importActual<typeof import('../hooks/useDefenseSfx')>()),
  useDefenseSfx: (enabled: boolean) => {
    useDefenseSfx(enabled);
    return sfx;
  },
}));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

function saveLocalWin() {
  const driver = GameDriver.fromBoard('campaign', 's1', 3);
  runGame(driver, greedyBot());
  const input = driver.toReplayInput();
  localStorage.setItem(
    'defense:replay:s1',
    JSON.stringify({ v: LOCAL_REPLAY_VERSION, engineVersion: ENGINE_VERSION, boardKey: 's1', difficulty: 'normal', seed: input.seed, ticks: input.ticks, inputs: input.inputs, stars: 3, livesLeft: driver.state.lives, savedAt: 1 }),
  );
  return input;
}

const frames = async (ms: number) => {
  await act(async () => {
    for (let t = 0; t < ms; t += 16) await vi.advanceTimersByTimeAsync(16);
  });
};

describe('디펜스 다시보기 소리 (games-polish P7)', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(sfx).forEach((fn) => fn.mockReset());
    useDefenseSfx.mockReset();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('디펜스 소리 설정을 따르고, 재생한 구간만 울린다 — 배속은 3단계까지, 멈추면 쉰다', { timeout: 30_000 }, async () => {
    const input = saveLocalWin();
    updateSettings({ sound: true });
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    // 저장된 설정은 마운트 뒤에 읽는다
    await waitFor(() => expect(useDefenseSfx).toHaveBeenLastCalledWith(true));
    expect(sfx.setPaused).toHaveBeenLastCalledWith(false);

    // 처음 몇 초 — 발사·명중 등 틱 이벤트 소리가 난다
    fireEvent.click(screen.getByTestId('defense-replay-speed-4'));
    expect(sfx.setSpeed).toHaveBeenLastCalledWith(3);
    await frames(3000);
    expect(sfx.play).toHaveBeenCalled();

    // 멈추면 쉬고, 멈춘 채 끝 근처로 탐색해도 건너뛴 구간은 울리지 않는다
    fireEvent.click(screen.getByTestId('defense-replay-play'));
    expect(sfx.setPaused).toHaveBeenLastCalledWith(true);
    sfx.play.mockClear();
    fireEvent.change(screen.getByTestId('defense-replay-seek'), { target: { value: String(Math.floor(input.ticks / TICKS_PER_SECOND / 2) * TICKS_PER_SECOND) } });
    await frames(64);
    expect(sfx.play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('defense-replay-speed-1'));
    expect(sfx.setSpeed).toHaveBeenLastCalledWith(1);
  });

  it('명령 소리 — 플레이와 같은 표(건설·판매·업그레이드·분기·웨이브 호출)', () => {
    expect([OP.BUILD, OP.SELL, OP.UPGRADE, OP.BRANCH, OP.CALL_WAVE, OP.PICK_AUGMENT].map((op) => commandSound(op, OP))).toEqual([
      SOUND.BUILD,
      SOUND.SELL,
      SOUND.UPGRADE,
      SOUND.UPGRADE,
      SOUND.WAVE_START,
      -1,
    ]);
  });

  it('끝에 닿아 멈추면 오디오를 쉬게 하지 않는다 — 마지막 소리가 끝까지 나게(사용자가 멈출 때만 쉼)', { timeout: 30_000 }, async () => {
    const input = saveLocalWin();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    // 끝 1초 전으로 가서 끝까지 재생
    fireEvent.change(screen.getByTestId('defense-replay-seek'), { target: { value: String(Math.floor(input.ticks / TICKS_PER_SECOND - 1) * TICKS_PER_SECOND) } });
    await frames(64);
    expect(screen.getByTestId('defense-replay-play').getAttribute('aria-pressed')).toBe('true');
    await frames(2500);
    expect(screen.getByTestId('defense-replay-play').getAttribute('aria-pressed')).toBe('false');
    expect(sfx.setPaused).toHaveBeenLastCalledWith(false);
    expect(sfx.setPaused).not.toHaveBeenCalledWith(true);
  });

  it('소리 버튼 — 디펜스 소리 설정을 바꾸고 그 클릭(제스처) 안에서 켠다', async () => {
    saveLocalWin();
    render(<LocalReplayView stageId="s1" />);
    await screen.findByTestId('defense-replay', {}, { timeout: 5000 });
    const toggle = screen.getByRole('button', { name: '효과음' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(sfx.setEnabled).toHaveBeenLastCalledWith(true);
    expect(loadSettings().sound).toBe(true);
    expect(screen.getByRole('button', { name: '효과음' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: '효과음' }));
    expect(sfx.setEnabled).toHaveBeenLastCalledWith(false);
    expect(loadSettings().sound).toBe(false);
  });
});
