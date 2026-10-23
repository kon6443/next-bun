// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { ENGINE_VERSION, OP, TOWER_ID, applyCommand, createCommandRecorder, createGame, findStage, recordCommand, step } from '../engine';
import { loadProgress } from '../lib/progress';
import { loadResume, saveResume } from '../lib/resume';
import { loadSettings } from '../lib/settings';
import DefensePlay, { nearestSlotInDirection } from './DefensePlay';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: toast }));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

describe('DefensePlay F1b — 학습·효과음·이어하기·나가기', () => {
  let audioContexts = 0;
  beforeEach(() => {
    localStorage.clear();
    replace.mockClear();
    audioContexts = 0;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    // AudioContext를 만들면 센다 — 효과음이 꺼진 동안 0이어야 한다
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          audioContexts += 1;
          throw new Error('테스트에서 소리는 내지 않는다');
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('S1 첫 판은 튜토리얼 3단계 — 슬롯 열기 → 건설 → 웨이브 시작이면 끝나고 저장', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    const tutorial = await screen.findByTestId('defense-tutorial');
    expect(tutorial.dataset.step).toBe('0');
    // 가리키는 7번은 아래쪽이지만 위 띠에는 0번 슬롯이 있다 — 슬롯이 없는 아래 띠로
    expect(within(tutorial).getByRole('status').dataset.place).toBe('bottom');
    fireEvent.click(screen.getByTestId('defense-slot-7'), { detail: 1 });
    expect(screen.getByTestId('defense-tutorial').dataset.step).toBe('1');
    fireEvent.click(screen.getByTestId('defense-ring-build-0'));
    fireEvent.click(screen.getByTestId('defense-ring-build-0'));
    expect(screen.getByTestId('defense-tutorial').dataset.step).toBe('2');
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    expect(screen.queryByTestId('defense-tutorial')).toBeNull();
    expect(loadProgress().tutorialDone).toBe(true);
  });

  it('튜토리얼은 건너뛸 수 있고, 끝낸 뒤에는 다시 나오지 않는다', async () => {
    const { unmount } = render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    fireEvent.click(await screen.findByTestId('defense-tutorial-skip'));
    expect(screen.queryByTestId('defense-tutorial')).toBeNull();
    unmount();
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    await screen.findByTestId('defense-slot-0');
    expect(screen.queryByTestId('defense-tutorial')).toBeNull();
  });

  it('새 요소 스테이지(S2) 첫 판은 브리핑 카드 — 닫으면 저장, 다음 판에는 없다', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s1: { normal: 3 } }, tutorialDone: true }));
    const { unmount } = render(<DefensePlay boardKey="s2" seed={1} fixedSeed />);
    const card = await screen.findByTestId('defense-briefing');
    expect(card.textContent).toContain('방패병');
    // 브리핑 중에는 단축키가 판에 가지 않는다
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('ready');
    fireEvent.click(screen.getByTestId('defense-briefing-close'));
    expect(screen.queryByTestId('defense-briefing')).toBeNull();
    expect(loadProgress().briefingsSeen).toEqual(['s2']);
    unmount();
    render(<DefensePlay boardKey="s2" seed={1} fixedSeed />);
    await screen.findByTestId('defense-slot-0');
    expect(screen.queryByTestId('defense-briefing')).toBeNull();
  });

  it('효과음은 기본 꺼짐 — 꺼진 동안 AudioContext 0, 토글하면 켜짐 저장(같은 값을 설정이 쓴다)', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    const toggle = await screen.findByTestId('defense-sound');
    expect([toggle.dataset.value, toggle.getAttribute('aria-pressed')]).toEqual(['off', 'false']);
    fireEvent.click(screen.getByTestId('defense-slot-0'), { detail: 1 });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(audioContexts).toBe(0);
    fireEvent.click(toggle);
    expect(screen.getByTestId('defense-sound').dataset.value).toBe('on');
    expect(loadSettings().sound).toBe(true);
    expect(audioContexts).toBe(1);
  });

  it('이어하기 — 같은 보드 저장본이면 고르게 하고, 이어하면 저장 틱의 판을 일시정지로 연다', async () => {
    const stage = findStage('s1')!;
    const state = createGame(stage, 5);
    const recorder = createCommandRecorder();
    const send = (op: number, a = 0, b = 0) => applyCommand(state, op, a, b) && recordCommand(recorder, state.tick, op, a, b);
    send(OP.BUILD, 7, TOWER_ID.CANNON);
    send(OP.CALL_WAVE);
    for (let i = 0; i < 400; i++) step(state);
    saveResume({ engineVersion: ENGINE_VERSION, boardKey: 's1', seed: 5, tick: state.tick, inputs: recorder.inputs, savedAt: 1 });
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: {}, tutorialDone: true }));
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    fireEvent.click(await screen.findByTestId('defense-resume-continue'));
    const board = await screen.findByTestId('defense-board');
    expect(board.dataset.status).toBe('paused');
    expect(screen.getByTestId('defense-slot-7').dataset.tower).toBe(String(TOWER_ID.CANNON));
    expect(screen.getByTestId('defense-gold').dataset.value).toBe(String(state.gold));
    expect(screen.getByTestId('defense-wave').dataset.value).toBe(String(state.wavesStarted));
  });

  it('새로 시작을 고르면 저장본을 지우고 빈 판', async () => {
    saveResume({ engineVersion: ENGINE_VERSION, boardKey: 's1', seed: 5, tick: 10, inputs: [0, OP.CALL_WAVE], savedAt: 1 });
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    fireEvent.click(await screen.findByTestId('defense-resume-new'));
    expect((await screen.findByTestId('defense-board')).dataset.status).toBe('ready');
    expect(loadResume()).toBeNull();
  });

  it('판 중 나가기는 확인 — 나가면 이어하기 저장 후 스테이지 화면으로(replace)', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: {}, tutorialDone: true }));
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    await screen.findByTestId('defense-slot-0');
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    fireEvent.click(screen.getByTestId('defense-exit'));
    expect(replace).not.toHaveBeenCalled();
    // 확인을 고르는 동안 판은 멈춘다
    expect(screen.getByTestId('defense-board').dataset.status).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    expect(replace).toHaveBeenCalledWith('/games/defense/campaign/s1');
    expect(loadResume()).toMatchObject({ boardKey: 's1', seed: 1 });
  });

  it('나가기 확인에서 계속하기를 누르면 멈췄던 판이 다시 진행된다', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: {}, tutorialDone: true }));
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    await screen.findByTestId('defense-slot-0');
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    fireEvent.click(screen.getByTestId('defense-exit'));
    fireEvent.click(screen.getByRole('button', { name: '계속하기' }));
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
  });

  it('브리핑이 떠 있는 동안 웨이브 호출 버튼은 막힌다', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s1: { normal: 3 } }, tutorialDone: true }));
    render(<DefensePlay boardKey="s2" seed={1} fixedSeed />);
    await screen.findByTestId('defense-briefing');
    const call = screen.getByTestId('defense-call-wave') as HTMLButtonElement;
    expect(call.disabled).toBe(true);
    fireEvent.click(screen.getByTestId('defense-briefing-close'));
    expect((screen.getByTestId('defense-call-wave') as HTMLButtonElement).disabled).toBe(false);
  });

  it('다른 판의 이어하기 저장이 있으면 시작 화면에서 바뀐다고 알린다', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s1: { normal: 3 } }, tutorialDone: true, briefingsSeen: ['s2'] }));
    saveResume({ engineVersion: ENGINE_VERSION, boardKey: 's1-easy', seed: 5, tick: 10, inputs: [0, OP.CALL_WAVE], savedAt: 1 });
    render(<DefensePlay boardKey="s2" seed={1} fixedSeed />);
    expect((await screen.findByTestId('defense-notice')).textContent).toContain('스테이지 1 쉬움');
  });

  it('튜토리얼 중 시작 안내는 말풍선에 붙어 같은 쪽에 — 가리키는 슬롯 쪽으로 따로 뜨지 않는다', async () => {
    saveResume({ engineVersion: ENGINE_VERSION, boardKey: 's1-easy', seed: 5, tick: 10, inputs: [0, OP.CALL_WAVE], savedAt: 1 });
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    const tutorial = await screen.findByTestId('defense-tutorial');
    expect(within(tutorial).getByTestId('defense-notice').textContent).toContain('스테이지 1 쉬움');
    expect(screen.getAllByTestId('defense-notice')).toHaveLength(1);
    // 건너뛰면 튜토리얼 밖 위쪽 안내로 — 여전히 한 장
    fireEvent.click(screen.getByTestId('defense-tutorial-skip'));
    expect(screen.queryByTestId('defense-tutorial')).toBeNull();
    expect(screen.getAllByTestId('defense-notice')).toHaveLength(1);
  });

  it('무한·주간 저장본이 있어도 캠페인 판에서 바뀐다고 알린다(세션 붙은 저장본을 말없이 덮지 않게)', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s1: { normal: 3 } }, tutorialDone: true, briefingsSeen: ['s2'] }));
    saveResume({ engineVersion: ENGINE_VERSION, mode: 'weekly', boardKey: 'weekly-2026-w43', seed: 5, tick: 10, inputs: [0, OP.CALL_WAVE], savedAt: 1, sessionId: 's', sessionReceivedAt: 1 });
    render(<DefensePlay boardKey="s2" seed={1} fixedSeed />);
    expect((await screen.findByTestId('defense-notice')).textContent).toContain('W43 주간 도전');
  });

  it('방향키 슬롯 커서 — 그 방향의 가장 가까운 슬롯, 없으면 -1', () => {
    const slots = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
      { x: 1000, y: 900 },
    ];
    expect(nearestSlotInDirection(slots, 0, 1, 0)).toBe(1);
    expect(nearestSlotInDirection(slots, 0, 0, 1)).toBe(2);
    expect(nearestSlotInDirection(slots, 1, 0, 1)).toBe(3);
    expect(nearestSlotInDirection(slots, 0, -1, 0)).toBe(-1);
  });

  it('이어하기 저장이 실패하면(저장소 차단·용량) 판당 한 번 알린다 (games-polish FE-46)', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: {}, tutorialDone: true }));
    toast.mockClear();
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    await screen.findByTestId('defense-slot-0');
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const hide = () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    hide();
    hide();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(String(toast.mock.calls[0][0])).toContain('이어하기를 저장하지 못했어요');
  });
});
