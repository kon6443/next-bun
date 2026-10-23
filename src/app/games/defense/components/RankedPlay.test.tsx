// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ApiError } from '@/types/api';
import { ENGINE_VERSION, OP, step } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { greedyBot } from '../engine-dev/sim/bots';
import { runGame } from '../engine-dev/sim/runner';
import { AUGMENT_TEXT } from '../lib/labels';
import { loadResume, saveResume } from '../lib/resume';
import RankedPlay from './RankedPlay';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
const createGameSession = vi.hoisted(() => vi.fn());
const submitGameScore = vi.hoisted(() => vi.fn());
const getGameRankings = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({ createGameSession, getGameRankings, submitGameScore }));
const session = (mode: 'endless' | 'weekly', boardKey: string) => ({
  code: 'SUCCESS',
  message: '',
  data: { sessionId: 'sess-1', seed: 3449748544, engineVersion: ENGINE_VERSION, expiresAt: '2026-10-23T00:00:00Z', boardKey, mode },
});
// next/link 전용 속성(replace·scroll)은 <a>에 넘기지 않는다
const linkAttrs = (rest: Record<string, unknown>) => Object.fromEntries(Object.entries(rest).filter(([key]) => key !== 'replace' && key !== 'scroll'));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...linkAttrs(rest)}>{children}</a> }));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

/** 무한 판을 첫 증강 대기까지 돌려 이어하기로 저장 */
function saveEndlessAtAugment(): GameDriver {
  const driver = GameDriver.fromBoard('endless', 'endless-s1', 7);
  runGame(driver, greedyBot(), (d) => d.state.augmentPending);
  saveResume({ engineVersion: ENGINE_VERSION, mode: 'endless', boardKey: 'endless-s1', seed: 7, tick: driver.state.tick, inputs: driver.recorder.inputs, savedAt: 1 });
  return driver;
}

/**
 * 타워 없이 웨이브를 부르고 카운트다운마다 다시 부르는 무한 판(목숨이 금방 0) — 끝나기 몇 틱 전에 이어하기로 저장
 * 저장 틱까지의 로그로 다시 돌리면 같은 판이라, 이어 가면 곧 게임 오버
 */
function saveEndlessNearOver(sessionReceivedAt: number | null): { endTick: number; inputs: number[] } {
  const play = (stopAt: number) => {
    const driver = GameDriver.fromBoard('endless', 'endless-s1', 9);
    driver.must(OP.CALL_WAVE);
    while (!driver.state.over && driver.state.tick < stopAt) {
      if (driver.state.countdown > 0) driver.command(OP.CALL_WAVE);
      step(driver.state);
    }
    return driver;
  };
  const full = play(Infinity);
  const near = play(full.state.endTick - 3);
  saveResume({
    engineVersion: ENGINE_VERSION,
    mode: 'endless',
    boardKey: 'endless-s1',
    seed: 9,
    tick: near.state.tick,
    inputs: near.recorder.inputs,
    savedAt: 1,
    ...(sessionReceivedAt === null ? {} : { sessionId: 'sess-near', sessionReceivedAt }),
  });
  return { endTick: full.state.endTick, inputs: full.recorder.inputs };
}

describe('RankedPlay — 무한·주간 입구', () => {
  beforeEach(() => {
    localStorage.clear();
    // 무한·주간은 스테이지 4를 깨야 열린다
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s4: { normal: 1 } } }));
    createGameSession.mockReset();
    submitGameScore.mockReset();
    getGameRankings.mockReset().mockResolvedValue({ code: 'SUCCESS', message: '', data: { boardKey: 'endless-s1', items: [], periodStart: null } });
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('시작 → 무한 판(웨이브는 총수 없이 n) → 웨이브 호출하면 진행', async () => {
    render(<RankedPlay mode="endless" fixedSeed={3} />);
    fireEvent.click(await screen.findByTestId('defense-ranked-play'));
    const wave = await screen.findByTestId('defense-wave');
    expect([...wave.querySelectorAll('[aria-hidden="true"]')].map((n) => n.textContent).join('')).toBe('W0');
    expect([...wave.querySelectorAll('.sr-only')].map((n) => n.textContent).join(' ')).toBe('웨이브 0');
    expect(screen.getByRole('main').getAttribute('aria-label')).toBe('무한 모드 시즌 1');
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
  });

  it('주간 판은 이번 주 규칙 아이콘 줄 — 누르면 설명', async () => {
    render(<RankedPlay mode="weekly" fixedSeed={11} />);
    fireEvent.click(await screen.findByTestId('defense-ranked-play'));
    const rules = await screen.findAllByTestId('defense-rule');
    expect(rules.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(rules[0]);
    expect(rules[0].getAttribute('aria-expanded')).toBe('true');
  });

  it('증강 대기에서 저장한 판을 이어하면 카드 선택부터 — 2탭으로 고르면 진행·보유 카드 줄에 뜬다', async () => {
    const driver = saveEndlessAtAugment();
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    expect((await screen.findByTestId('defense-board')).dataset.status).toBe('augment');
    const first = screen.getByTestId('defense-augment-card-0');
    expect(first.textContent).toContain(AUGMENT_TEXT[driver.state.augmentChoices[0]].name);
    // 대기 중에는 웨이브 호출·단축키가 막힌다
    expect((screen.getByTestId('defense-call-wave') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(first);
    expect(screen.getByTestId('defense-board').dataset.status).toBe('augment');
    fireEvent.click(screen.getByTestId('defense-augment-card-0'));
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
    expect(screen.queryByTestId('defense-augment')).toBeNull();
    expect(screen.getAllByTestId('defense-owned-augment')).toHaveLength(1);
    // 고른 순간 이어하기 저장(고른 카드가 저장본에 남는다)
    expect(loadResume()!.inputs.length).toBe(driver.recorder.inputs.length + 3);
  });

  it('시작을 누르면 그 모드로 세션을 받아 서버 seed·보드로 판을 연다 — 이어하기 저장에 세션이 함께', async () => {
    createGameSession.mockResolvedValue(session('weekly', 'weekly-2026-w43'));
    render(<RankedPlay mode="weekly" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-ranked-play'));
    await screen.findByTestId('defense-board');
    expect(createGameSession).toHaveBeenCalledWith('defense', undefined, 'weekly');
    expect(screen.getByRole('main').getAttribute('aria-label')).toBe('W43 주간 도전');
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    expect(loadResume()).toMatchObject({ mode: 'weekly', boardKey: 'weekly-2026-w43', seed: 3449748544, sessionId: 'sess-1' });
  });

  it('세션 발급 실패(주간 비활성 503)면 이유를 알리고 로컬 판으로 — 웨이브 전 안내에 뜬다', async () => {
    createGameSession.mockRejectedValue(new ApiError('GAME_WEEKLY_UNAVAILABLE', '주간 꺼짐', 503));
    render(<RankedPlay mode="weekly" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-ranked-play'));
    const notice = await screen.findByTestId('defense-notice');
    expect(notice.textContent).toContain('주간 도전');
    expect(screen.getByTestId('defense-board').dataset.status).toBe('ready');
  });

  it('엔진 버전이 다른 세션이면 등록 없이 로컬 판', async () => {
    createGameSession.mockResolvedValue({ ...session('endless', 'endless-s1'), data: { ...session('endless', 'endless-s1').data, engineVersion: ENGINE_VERSION + 1 } });
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-ranked-play'));
    expect((await screen.findByTestId('defense-notice')).textContent).toContain('업데이트');
  });

  it('받은 지 3시간 40분 지난 세션으로 이어하면 만료 예고 띠, 4시간이 지나면 만료 띠', async () => {
    saveEndlessAtAugment();
    const slot = loadResume()!;
    saveResume({ ...slot, sessionId: 'old', sessionReceivedAt: Date.now() - (4 * 60 - 20) * 60 * 1000 });
    const { unmount } = render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    await waitFor(() => expect(screen.getByTestId('defense-session-banner').dataset.expired).toBe('false'));
    unmount();
    saveResume({ ...slot, sessionId: 'old', sessionReceivedAt: Date.now() - 4 * 60 * 60 * 1000 });
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    await waitFor(() => expect(screen.getByTestId('defense-session-banner').dataset.expired).toBe('true'));
  });

  it('스테이지 4를 깨기 전에는 잠김 — 랭킹 보기는 열려 있다', async () => {
    localStorage.removeItem('defense:progress');
    render(<RankedPlay mode="weekly" fixedSeed={null} />);
    await screen.findByTestId('defense-ranked-locked');
    expect(screen.queryByTestId('defense-ranked-play')).toBeNull();
    expect(screen.getByRole('link', { name: '랭킹 보기' }).getAttribute('href')).toBe('/games/defense/rankings?board=weekly');
  });

  it('게임 오버 → 결과(최고 기록 1회 저장) → 등록하면 엔진과 같은 리플레이(frames = 끝난 틱·명령 로그)를 낸다', async () => {
    const expected = saveEndlessNearOver(Date.now());
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: '', data: { scoreId: 11, score: 0, detail: {}, ranks: { daily: 1, weekly: 1, all: 1 } } });
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    // 이어한 판은 일시정지로 열린다 — 계속하면 곧 끝난다
    fireEvent.click(screen.getByTestId('defense-pause'));
    await screen.findByTestId('defense-ranked-result', {}, { timeout: 3000 });
    // 세션 있는 판 — 보드별 최고 기록을 한 번 남기고 결과에 "개인 최고"
    expect(JSON.parse(localStorage.getItem('defense:best')!).boards['endless-s1']).toBeGreaterThan(0);
    expect(screen.getByText('개인 최고 기록!')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('랭킹에 올릴 이름'), { target: { value: '수비왕' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '랭킹 등록' }));
    });
    expect(submitGameScore).toHaveBeenCalledWith('defense', { sessionId: 'sess-near', playerName: '수비왕', replay: { engineVersion: ENGINE_VERSION, frames: expected.endTick, inputs: expected.inputs } }, undefined);
    expect(screen.getByRole('link', { name: '랭킹 보기' }).getAttribute('href')).toBe('/games/defense/rankings?highlight=11&board=endless-s1');
    // 재생기·공유 — 무한 기록은 등록 직후 다시보기·공유
    expect(screen.getByRole('link', { name: /내 플레이 다시보기/ }).getAttribute('href')).toBe('/games/defense/replays/11');
    expect(screen.getByTestId('defense-share').textContent).toBe('이 기록 공유하기');
    // 결과 화면에서 다시 하기 = 새 세션(세션은 판마다 1회용) — 받는 동안 결과는 그대로, 연타해도 한 번만
    let resolveSession: (value: unknown) => void = () => {};
    createGameSession.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)));
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
    fireEvent.click(screen.getByRole('button', { name: '다시 하기' }));
    expect(createGameSession).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('defense-ranked-result')).toBeTruthy();
    await act(async () => {
      resolveSession(session('endless', 'endless-s1'));
    });
    expect(screen.queryByTestId('defense-ranked-result')).toBeNull();
    expect(screen.getByTestId('defense-board').dataset.status).toBe('ready');
  });

  it('세션이 만료된 채 끝난 판은 등록하지 않고 이유를 알린다', async () => {
    saveEndlessNearOver(Date.now() - 4 * 60 * 60 * 1000);
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    fireEvent.click(screen.getByTestId('defense-pause'));
    const result = await screen.findByTestId('defense-ranked-result', {}, { timeout: 3000 });
    expect(result.textContent).toContain('세션 시간이 지나');
    expect(screen.queryByRole('button', { name: '랭킹 등록' })).toBeNull();
    // 등록할 수 없는 판은 최고 기록도 남기지 않는다
    expect(localStorage.getItem('defense:best')).toBeNull();
    expect(screen.queryByText('개인 최고 기록!')).toBeNull();
  });

  it('다른 모드 저장본은 이어하기로 제시하지 않고(바뀐다고 안내), 깨진 같은 모드 저장본은 안내 후 새로 시작', async () => {
    saveResume({ engineVersion: ENGINE_VERSION, mode: 'weekly', boardKey: 'weekly-2026-w43', seed: 1, tick: 10, inputs: [0, OP.CALL_WAVE], savedAt: 1 });
    const { unmount } = render(<RankedPlay mode="endless" fixedSeed={3} />);
    expect(await screen.findByTestId('defense-ranked-play')).toBeTruthy();
    expect(screen.queryByTestId('defense-resume-continue')).toBeNull();
    fireEvent.click(screen.getByTestId('defense-ranked-play'));
    expect((await screen.findByTestId('defense-notice')).textContent).toContain('다른 판의 이어하기 저장');
    // 무한·주간 나가기 버튼은 디펜스 처음으로
    expect(screen.getByTestId('defense-exit').getAttribute('aria-label')).toBe('디펜스 처음으로 나가기');
    unmount();
    // 같은 모드인데 다시 돌릴 수 없는 저장본(틱이 로그보다 짧다)
    saveResume({ engineVersion: ENGINE_VERSION, mode: 'endless', boardKey: 'endless-s1', seed: 1, tick: 0, inputs: [5, OP.CALL_WAVE], savedAt: 1 });
    render(<RankedPlay mode="endless" fixedSeed={3} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    expect(screen.getByTestId('defense-resume-failed').textContent).toContain('이어하기를 불러오지 못해');
    expect(loadResume()).toBeNull();
  });

  it('로컬 주간 판 안내에는 맵·규칙이 공식 판과 다르다고', async () => {
    createGameSession.mockRejectedValue(new Error('network'));
    render(<RankedPlay mode="weekly" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-ranked-play'));
    expect((await screen.findByTestId('defense-notice')).textContent).toContain('맵·규칙도 이번 주 공식 판과 달라요');
  });

  it('세션 없이 끝난 판은 최고 기록을 남기지 않는다', async () => {
    saveEndlessNearOver(null);
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    fireEvent.click(screen.getByTestId('defense-pause'));
    await screen.findByTestId('defense-ranked-result', {}, { timeout: 3000 });
    expect(localStorage.getItem('defense:best')).toBeNull();
    expect(screen.queryByText('개인 최고 기록!')).toBeNull();
  });

  it('카드 고르는 중 나가기 확인을 열면 카드 대화상자를 내리고(숫자 키도 안 먹는다), 계속하기면 다시', async () => {
    saveEndlessAtAugment();
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    await screen.findByTestId('defense-augment');
    fireEvent.click(screen.getByTestId('defense-exit'));
    expect(screen.queryByTestId('defense-augment')).toBeNull();
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('augment');
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }));
    expect(screen.getByTestId('defense-augment')).toBeTruthy();
  });

  it('카드는 키보드 1~3도 같은 2단계', async () => {
    saveEndlessAtAugment();
    render(<RankedPlay mode="endless" fixedSeed={null} />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    await screen.findByTestId('defense-augment');
    fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
    expect(screen.getByTestId('defense-augment-card-1').dataset.armed).toBe('true');
    fireEvent.keyDown(window, { key: '2', code: 'Digit2' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
  });
});
