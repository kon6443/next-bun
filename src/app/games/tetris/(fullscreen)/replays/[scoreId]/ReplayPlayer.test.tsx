// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ApiError } from '@/types/api';
import golden from '../../../engine/__fixtures__/golden-replays.json';
import { ENGINE_VERSION, FRAMES_PER_SECOND } from '../../../engine';
import { formatFrames } from '@/app/games/_shared/lib/format';

const loadReplay = vi.fn();
const getGameScore = vi.fn();
// 설정 시트의 스킨 줄이 로그인 상태를 본다 — 게스트
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('@/services/gameService', () => ({ getGameScore: (...a: unknown[]) => getGameScore(...a) }));
vi.mock('@/app/games/_shared/lib/replayLoader', () => ({ loadReplay: (...a: unknown[]) => loadReplay(...a) }));
// 판은 그리지 않는다 — 재생 컨트롤만 본다
vi.mock('../../../components/TetrisCanvas', () => ({ TetrisCanvas: () => null }));
vi.mock('@/app/games/_shared/hooks/useKakaoReady', () => ({ useKakaoReady: () => ({ kakao: 'off', kakaoScript: null }) }));
// 조회 기록·시청 보고는 훅 테스트(useReplayStats)가 맡는다 — 여기서는 재생기가 넘기는 값만
const stats = { recorded: null as number | null, addWatched: vi.fn(), viewCalls: [] as unknown[][] };
vi.mock('@/app/games/_shared/hooks/useReplayStats', async (importActual) => ({
  ...(await importActual<typeof import('@/app/games/_shared/hooks/useReplayStats')>()),
  useRecordedViewCount: (...args: unknown[]) => {
    stats.viewCalls.push(args);
    return stats.recorded;
  },
  useReplayWatchReport: () => stats.addWatched,
}));
const sound = { playCues: vi.fn(), setMusicPlaying: vi.fn(), unlock: vi.fn() };
vi.mock('../../../lib/sound/soundPlayer', async (importActual) => ({
  ...(await importActual<typeof import('../../../lib/sound/soundPlayer')>()),
  getSoundPlayer: () => sound,
}));

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
    sound.playCues.mockReset();
    sound.setMusicPlaying.mockReset();
    stats.recorded = null;
    stats.addWatched.mockReset();
    stats.viewCalls = [];
    getGameScore.mockReset();
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

  it('소리: 재생 중에만 배경음악, 탐색으로 건너뛴 구간의 효과음은 버린다 (P7)', async () => {
    // 입력이 촘촘한 기록 — 건너뛴 구간에 이동·고정음이 많다
    const slider = await ready('combo');
    expect(sound.setMusicPlaying).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    expect(sound.setMusicPlaying).toHaveBeenLastCalledWith(false);
    // 멈춘 채 멀리 탐색 — 건너뛴 이동·고정음이 다음 재생 프레임에 몰려 나면 안 된다
    // 이 기록은 앞 10초에 하드 드롭·줄 삭제가 몰려 있다 — 그 구간을 건너뛴다
    fireEvent.change(slider, { target: { value: '590' } });
    sound.playCues.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '재생' }));
    expect(sound.setMusicPlaying).toHaveBeenLastCalledWith(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(sound.playCues).toHaveBeenCalled();
    const largest = Math.max(...sound.playCues.mock.calls.map(([cues]) => (cues as unknown[]).length));
    expect(largest).toBeLessThanOrEqual(5);
  });

  it('설정 시트 안의 키(음량 막대 ←/→·Space)는 뒤의 재생을 옮기지 않는다 (P8)', async () => {
    const slider = await ready();
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    const before = slider.value;
    fireEvent.click(screen.getByRole('button', { name: /^설정 \(소리/ }));
    fireEvent.click(screen.getByTestId('settings-group-sound'));
    const dialog = screen.getByRole('dialog', { name: '소리' });
    const volume = within(dialog).getByRole('slider', { name: '효과음 음량' });
    fireEvent.keyDown(volume, { code: 'ArrowRight', key: 'ArrowRight' });
    fireEvent.keyDown(dialog, { code: 'Space', key: ' ' });
    expect((screen.getByTestId('tetris-replay-seek') as HTMLInputElement).value).toBe(before);
    expect(screen.getByRole('button', { name: '재생' })).toBeTruthy();
  });

  it('머리줄 — 제목 앞 ▶(누를 수 없는 장식) 없음, 입력 표시는 판 위가 아니라 판 아래 줄 (UX 점검·KeyOverlay)', async () => {
    await ready();
    const header = screen.getByRole('banner');
    expect(header.textContent).not.toMatch(/▶\s*\S+ · /);
    const overlay = screen.getByTestId('replay-key-overlay');
    // 판(캔버스) 칸 안에 겹쳐 두지 않는다 — 머리줄과 같은 화면 열의 한 줄
    expect(overlay.parentElement).toBe(header.parentElement);
  });

  it('머리줄에 조회수 — 조회 기록 응답이 있으면 그 값, 없으면 재생 응답의 값, 그것도 없으면 0 (replay-views)', async () => {
    loadReplay.mockResolvedValue({ ...replayOf('back-to-back'), viewCount: 3 });
    const { unmount } = render(<ReplayPlayer scoreId={1} />);
    expect(await screen.findByText(/· 조회 3$/, {}, { timeout: 5000 })).toBeTruthy();
    unmount();

    stats.recorded = 1234;
    await ready();
    expect(screen.getByText(/· 조회 1,234$/)).toBeTruthy();
  });

  it('시청 시간 — 재생 중에만 실제 경과 ms를 넘기고, 멈추면 넘기지 않는다 (replay-views)', async () => {
    await ready();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(stats.addWatched).toHaveBeenCalled();
    // 한 프레임 몫은 상한(100ms) 안
    for (const [ms] of stats.addWatched.mock.calls) expect(ms).toBeLessThanOrEqual(100);
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    // 일시정지가 반영된 뒤 다음 프레임부터
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    stats.addWatched.mockClear();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(stats.addWatched).not.toHaveBeenCalled();
  });

  it('조회는 재생 준비가 끝난 뒤에만 센다 — 불러오는 중·지원하지 않는 버전은 세지 않는다 (replay-views)', async () => {
    await ready();
    expect(stats.viewCalls[0]).toEqual(['tetris', 1, false]);
    expect(stats.viewCalls.at(-1)).toEqual(['tetris', 1, true]);
    cleanup();

    stats.viewCalls = [];
    loadReplay.mockResolvedValue({ ...replayOf('back-to-back'), engineVersion: ENGINE_VERSION + 1 });
    render(<ReplayPlayer scoreId={2} />);
    await act(async () => {});
    await act(async () => {});
    expect(stats.viewCalls.length).toBeGreaterThan(0);
    expect(stats.viewCalls.every(([, , playable]) => playable === false)).toBe(true);
  });

  it('도전장 — 이 기록으로 도전장 보내기·직접 도전 링크 (games-growth B2)', async () => {
    await ready();
    expect(screen.getByTestId('challenge-share').textContent).toBe('⚔️ 도전장 보내기');
    expect(screen.getByRole('link', { name: '직접 도전' }).getAttribute('href')).toBe('/games/tetris/challenge/1');
  });

  it('도전장 보드 기록이면 도전장은 원본(root) 기준 — 링크·문구가 실제 도전 상대와 같게 (games-growth B2)', async () => {
    getGameScore.mockResolvedValue({ data: { scoreId: 7, playerName: '원본왕', score: 12340, rank: 1, detail: { lines: 40, level: 5 }, durationMs: 1, createdAt: 'x' } });
    loadReplay.mockResolvedValue({ ...replayOf('back-to-back'), boardKey: 'challenge-7' });
    render(<ReplayPlayer scoreId={1} />);
    await screen.findByTestId('tetris-replay-seek', {}, { timeout: 5000 });
    expect(getGameScore).toHaveBeenCalledWith('tetris', 7);
    expect(await screen.findByRole('link', { name: '직접 도전' })).toHaveAttribute('href', '/games/tetris/challenge/7');
    // 공유는 원본이 온 뒤에 원본 이름·링크로
    fireEvent.click(await screen.findByTestId('challenge-share'));
    expect(screen.getByRole('heading', { name: '도전장 공유' })).toBeTruthy();
    expect(screen.getByText(/원본왕님의 12,340점에 도전!/)).toBeTruthy();
    expect(screen.getByText(/\/games\/tetris\/challenge\/7$/)).toBeTruthy();
  });

  it('데일리·도전장 기록은 그 보드 순위로 쓰고 랭킹으로 돌아갈 때도 그 보드로 (games-growth B1·B2)', async () => {
    getGameScore.mockReturnValue(new Promise(() => {}));
    loadReplay.mockResolvedValue({ ...replayOf('back-to-back'), rank: 3, boardKey: 'daily-2026-10-24' });
    const { unmount } = render(<ReplayPlayer scoreId={1} />);
    await screen.findByTestId('tetris-replay-seek', {}, { timeout: 5000 });
    expect(screen.getByText(/^10\/24 데일리 3위 · /)).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 랭킹' })).toHaveAttribute('href', '/games/tetris/rankings?highlight=1&board=daily-2026-10-24');
    unmount();

    // 원본 요약을 못 받아도(응답 없음) 직접 도전 링크는 원본으로 — 공유 버튼만 기다린다
    loadReplay.mockResolvedValue({ ...replayOf('back-to-back'), rank: 2, boardKey: 'challenge-7' });
    render(<ReplayPlayer scoreId={1} />);
    await screen.findByTestId('tetris-replay-seek', {}, { timeout: 5000 });
    expect(screen.getByText(/^도전장 2위 · /)).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 랭킹' })).toHaveAttribute('href', '/games/tetris/rankings?highlight=1&board=challenge-7');
    expect(screen.getByRole('link', { name: '직접 도전' })).toHaveAttribute('href', '/games/tetris/challenge/7');
    expect(screen.queryByTestId('challenge-share')).toBeNull();
  });

  it('기본 보드 기록은 지금처럼 "전체 N위"·기본 랭킹', async () => {
    await ready();
    expect(screen.getByText(/^전체 1위 · /)).toBeTruthy();
    expect(screen.getByRole('link', { name: '← 랭킹' })).toHaveAttribute('href', '/games/tetris/rankings');
  });
});
