// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameSession } from '@/types/game';
import { ApiError } from '@/types/api';
import { ENGINE_VERSION } from '../../engine';

const createGameSession = vi.fn<() => Promise<{ data: GameSession }>>();
vi.mock('@/services/gameService', () => ({ createGameSession: () => createGameSession() }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
// 판은 그리지 않는다 — 준비 화면·시작 흐름만 본다
vi.mock('../../components/TetrisCanvas', () => ({ TetrisCanvas: () => null }));
// 판 시작 인자(DAS·ARR)를 본다 — 실제 훅을 그대로 쓰고 start만 감싼다(같은 start면 같은 감싼 함수, 효과가 다시 돌지 않게)
const startCalls: Array<{ das: number; arr: number }> = [];
vi.mock('../../hooks/useTetrisPlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useTetrisPlay')>();
  const wrapped = new WeakMap<object, unknown>();
  return {
    ...actual,
    useTetrisPlay: (...args: Parameters<typeof actual.useTetrisPlay>) => {
      const play = actual.useTetrisPlay(...args);
      if (!wrapped.has(play.start)) {
        const start: typeof play.start = (seed, das, arr) => {
          startCalls.push({ das, arr });
          return play.start(seed, das, arr);
        };
        wrapped.set(play.start, start);
      }
      return { ...play, start: wrapped.get(play.start) as typeof play.start };
    },
  };
});

import TetrisPlay, { SLOW_SESSION_MS } from './TetrisPlay';
import { tetrisSettingsStore } from '../../lib/storage';

const HOUR = 60 * 60 * 1000;
const session = (expiresAt: string): GameSession => ({ sessionId: 's1', seed: 7, engineVersion: ENGINE_VERSION, expiresAt });

beforeEach(() => {
  createGameSession.mockReset();
  startCalls.length = 0;
  window.localStorage.clear();
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
});

describe('TetrisPlay 시작 (games-polish FE-12)', () => {
  it('세션 응답이 늦으면 "등록 없이 시작"으로 바로 시작하고, 늦게 온 응답은 이 판을 바꾸지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let resolve: (v: { data: GameSession }) => void = () => {};
    createGameSession.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<TetrisPlay />);
    await act(async () => {});
    expect(screen.getByRole('button', { name: '시작' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '등록 없이 시작' })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(SLOW_SESSION_MS);
    });
    fireEvent.click(screen.getByRole('button', { name: '등록 없이 시작' }));
    expect(screen.queryByText('준비됐나요?')).toBeNull();
    await act(async () => resolve({ data: session('2099-01-01T00:00:00Z') }));
    expect(screen.queryByText('준비됐나요?')).toBeNull();
    expect(createGameSession).toHaveBeenCalledTimes(1);
  });

  it('로그인이 만료돼 세션 발급이 401이면 익명 세션으로 바꾸지 않고, 다시 로그인하라고 알린 뒤 등록 없이 플레이 (USER_ID 누락)', async () => {
    createGameSession.mockRejectedValue(new ApiError('AUTH_UNAUTHORIZED', '인증 만료', 401));
    await act(async () => {
      render(<TetrisPlay />);
    });
    expect(createGameSession).toHaveBeenCalledTimes(1);
    expect(screen.getByText('로그인이 만료됐어요. 다시 로그인하면 랭킹에 등록할 수 있어요. 이번 판은 등록 없이 플레이해요.')).toBeTruthy();
  });

  it('남은 시간이 판 최대 길이보다 짧은 세션이면 시작할 때 새로 받은 뒤 시작한다', async () => {
    createGameSession
      .mockResolvedValueOnce({ data: session(new Date(Date.now() + HOUR / 2).toISOString()) })
      .mockResolvedValueOnce({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    expect(createGameSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('준비됐나요?')).toBeNull();
  });

  it('일시정지의 "처음부터"는 확인을 받는다 — 계속하기면 판이 그대로 (games-polish FE-27)', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '처음부터' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('처음부터 다시 할까요?');
    fireEvent.click(within(dialog).getByRole('button', { name: '계속하기' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(createGameSession).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '처음부터' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '처음부터' }));
    });
    expect(createGameSession).toHaveBeenCalledTimes(2);
    expect(screen.getByText('준비됐나요?')).toBeTruthy();
  });

  it('설정 시트을 열면 판을 멈추고, 모달 안의 P·Esc는 뒤의 판을 다시 진행시키지 않는다 (P8)', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    expect(screen.getByRole('button', { name: '일시정지' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^설정 \(소리/ }));
    const dialog = screen.getByRole('dialog', { name: '설정' });
    expect(screen.queryByRole('button', { name: '일시정지' })).toBeNull();
    fireEvent.keyDown(within(dialog).getByRole('button', { name: '닫기' }), { code: 'KeyP', key: 'p' });
    expect(screen.queryByRole('button', { name: '일시정지' })).toBeNull();
    fireEvent.keyDown(dialog, { code: 'Escape', key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '설정' })).toBeNull();
    expect(screen.queryByRole('button', { name: '일시정지' })).toBeNull();
  });

  it('판 도중 바꾼 DAS·ARR은 진행 중인 판을 바꾸거나 다시 시작하지 않고, 다음 판부터 적용된다 (D-001)', async () => {
    tetrisSettingsStore.save({ das: 15, arr: 4 });
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    expect(startCalls).toEqual([{ das: 15, arr: 4 }]);
    // 설정 시트(다른 화면)에서 바꾼 것과 같다 — 같은 스토어에 저장
    act(() => {
      tetrisSettingsStore.save({ das: 6, arr: 0 });
    });
    expect(startCalls).toHaveLength(1);
    expect(screen.getByRole('button', { name: '일시정지' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '처음부터' }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '처음부터' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    expect(startCalls).toEqual([
      { das: 15, arr: 4 },
      { das: 6, arr: 0 },
    ]);
  });
});

describe('TetrisPlay 조작 안내 (UX 점검)', () => {
  const mockPointer = (coarse: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query === '(pointer: coarse)' ? coarse : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );

  it('터치 기기는 준비 화면에 패드 버튼 안내 — 키보드 표 대신', async () => {
    const spy = mockPointer(true);
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    const guide = screen.getByTestId('control-guide');
    expect(guide.textContent).toContain('⤓ 드롭');
    expect(guide.textContent).not.toContain('Space');
    spy.mockRestore();
  });

  it('터치 기기의 일시정지 메뉴에는 안내를 두지 않는다 — 패드가 바로 아래 보이고, 메뉴가 화면(375×667)을 넘지 않게', async () => {
    const spy = mockPointer(true);
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    expect(screen.getByRole('heading', { name: '일시정지' })).toBeTruthy();
    expect(screen.queryByTestId('control-guide')).toBeNull();
    spy.mockRestore();
  });

  it('키보드 기기는 키 표', async () => {
    const spy = mockPointer(false);
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    expect(screen.getByTestId('control-guide').textContent).toContain('Space');
    spy.mockRestore();
  });
});

describe('TetrisPlay 세션 실패 문구 (UX 점검)', () => {
  it('일반 판도 고정 문구 — 서버·망 원문을 붙이지 않는다', async () => {
    createGameSession.mockRejectedValue(new ApiError('INTERNAL_SERVER_ERROR', 'Internal server error: db timeout', 500));
    await act(async () => {
      render(<TetrisPlay />);
    });
    expect(screen.getByText('랭킹 등록을 준비하지 못했어요. 이번 판은 등록 없이 플레이해요.')).toBeTruthy();
    expect(screen.queryByText(/db timeout/)).toBeNull();
  });
});

describe('TetrisPlay 일시정지 스킨 진입 (D-003)', () => {
  it('일시정지 메뉴의 "스킨 바꾸기" — 스킨 상세로 바로, 닫아도 판은 멈춘 채', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '스킨 바꾸기' }));
    expect(screen.getByRole('dialog', { name: '스킨' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '스킨' })).toBeNull();
    expect(screen.getByRole('heading', { name: '일시정지' })).toBeTruthy();
  });
});

describe('TetrisPlay 설정 시트와 준비 화면 (리뷰)', () => {
  it('준비 화면에서 시트를 연 사이 세션이 와도 "시작"이 포커스를 가져가지 않고, 닫은 뒤에 옮긴다', async () => {
    let resolve: (v: { data: GameSession }) => void = () => {};
    createGameSession.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<TetrisPlay />);
    await act(async () => {});
    const open = screen.getByRole('button', { name: '설정' });
    open.focus();
    await act(async () => {
      fireEvent.click(open);
    });
    const sheet = screen.getByRole('dialog', { name: '설정' });
    // 준비 화면에서는 곧 시작할 판에 들어간다 — "다음 판부터"가 아니다
    await act(async () => {
      fireEvent.click(screen.getByTestId('settings-group-controls'));
    });
    expect(screen.queryByText('DAS·ARR은 다음 판부터 적용돼요.')).toBeNull();
    await act(async () => resolve({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) }));
    expect(screen.getByRole('button', { name: '시작' })).toBeEnabled();
    expect(sheet.contains(document.activeElement)).toBe(true);
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '시작' }));
    expect(screen.getByText('준비됐나요?')).toBeTruthy();
  });

  it('일시정지의 "스킨 바꾸기"도 판 도중 규칙 — 조작은 "다음 판부터", 떠나는 링크 없음', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    fireEvent.click(screen.getByRole('button', { name: '일시정지' }));
    fireEvent.click(screen.getByRole('button', { name: '스킨 바꾸기' }));
    expect(screen.queryByRole('link', { name: /전체 스킨 보기/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '설정 목록으로' }));
    fireEvent.click(screen.getByTestId('settings-group-controls'));
    expect(screen.getByText('DAS·ARR은 다음 판부터 적용돼요.')).toBeTruthy();
  });

  it('세션이 이미 준비된 채 시트를 열고 닫으면 연 버튼으로 돌아온다 — "시작"이 가져가지 않는다', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '시작' }));
    const open = screen.getByRole('button', { name: '설정' });
    open.focus();
    await act(async () => {
      fireEvent.click(open);
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(document.activeElement).toBe(open);
  });

  it('판 도중 HUD 톱니를 마우스로 열고 닫으면 포커스는 일시정지 메뉴에 — 톱니에 남아 Space가 시트를 다시 열지 않게', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    const gear = screen.getByRole('button', { name: /^설정 \(소리/ });
    await act(async () => {
      fireEvent.click(gear, { detail: 1 });
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).not.toBe(gear);
    expect(screen.getByRole('heading', { name: '일시정지' })).toBeTruthy();
  });

  it('일시정지 중 톱니를 마우스로 열고 닫아 포커스가 톱니에 남아도, 재개 뒤 Space keyup은 톱니를 누르지 않는다(기본 동작 막음, FE-36)', async () => {
    createGameSession.mockResolvedValue({ data: session(new Date(Date.now() + 2 * HOUR).toISOString()) });
    render(<TetrisPlay />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '시작' }));
    });
    fireEvent.keyDown(window, { code: 'KeyP', key: 'p' });
    expect(screen.getByRole('heading', { name: '일시정지' })).toBeTruthy();
    const gear = screen.getByRole('button', { name: /^설정 \(소리/ });
    // 마우스 누름(mousedown)이 톱니로 포커스를 옮긴 뒤 클릭 — 버튼이 스스로 포커스를 놓는다
    gear.focus();
    await act(async () => {
      fireEvent.click(gear, { detail: 1 });
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(gear);
    fireEvent.keyDown(gear, { code: 'KeyP', key: 'p' });
    expect(screen.queryByRole('heading', { name: '일시정지' })).toBeNull();
    // fireEvent는 기본 동작이 막혔으면 false
    expect(fireEvent.keyUp(gear, { code: 'Space', key: ' ' })).toBe(false);
  });
});
