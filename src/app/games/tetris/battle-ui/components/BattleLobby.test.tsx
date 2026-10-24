// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { RoomSummary } from '@/types/tetrisBattleSocket';

type ListResult = { ok: true; data: RoomSummary[] } | { ok: false; code: string };
const listRooms = vi.fn<() => Promise<ListResult>>();
const reconnect = vi.fn();
const ctx = {
  status: 'connected' as 'connecting' | 'connected' | 'disconnected' | 'failed',
  rooms: null as RoomSummary[] | null,
  room: null,
  listRooms: () => listRooms(),
  createRoom: vi.fn(),
  leaveRoom: vi.fn(),
  reconnect: () => reconnect(),
};
vi.mock('../contexts/BattleSocketContext', () => ({
  useBattleSocket: () => ctx,
  useEnterScope: () => ({ cancelled: false }),
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
const toastFn = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({ default: Object.assign(toastFn, { success: vi.fn(), error: vi.fn() }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { BattleLobby, LIST_RETRY_MS } from './BattleLobby';

describe('BattleLobby 방 목록 (games-polish 새로고침·FE-33)', () => {
  beforeEach(() => {
    listRooms.mockReset();
    reconnect.mockReset();
    ctx.status = 'connected';
    ctx.rooms = null;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('새로고침은 응답을 받을 때까지 잠근다 — 연타로 목록 한도(RATE_LIMITED)에 걸리지 않게', async () => {
    ctx.rooms = [];
    listRooms.mockResolvedValueOnce({ ok: true, data: [] });
    render(<BattleLobby />);
    await act(async () => {});
    let resolve: (r: ListResult) => void = () => {};
    listRooms.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const button = screen.getByRole('button', { name: '새로고침' });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(listRooms).toHaveBeenCalledTimes(2);
    await act(async () => resolve({ ok: true, data: [] }));
    expect(button).toBeEnabled();
  });

  it('연결 직후 목록 받기가 일시 거절(RATE_LIMITED·SERVICE_UNAVAILABLE)이면 잠시 뒤 다시 받는다 — 로비 구독이 빠지지 않게', async () => {
    vi.useFakeTimers();
    listRooms
      .mockResolvedValueOnce({ ok: false, code: 'RATE_LIMITED' })
      .mockResolvedValueOnce({ ok: false, code: 'SERVICE_UNAVAILABLE' })
      .mockResolvedValueOnce({ ok: true, data: [] });
    render(<BattleLobby />);
    await act(async () => {});
    expect(listRooms).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/요청이 너무 많아요/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_RETRY_MS);
    });
    expect(listRooms).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_RETRY_MS);
    });
    expect(listRooms).toHaveBeenCalledTimes(3);
    expect(screen.queryByText(/요청이 너무 많아요|이용할 수 없어요/)).toBeNull();
  });

  it('그 밖의 거절은 다시 받지 않는다', async () => {
    vi.useFakeTimers();
    listRooms.mockResolvedValue({ ok: false, code: 'INVALID_PAYLOAD' });
    render(<BattleLobby />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIST_RETRY_MS * 3);
    });
    expect(listRooms).toHaveBeenCalledTimes(1);
  });

  it('연결이 끝내 실패하면 끝없는 스피너 대신 안내와 다시 연결 버튼', () => {
    ctx.status = 'failed';
    render(<BattleLobby />);
    expect(screen.getByText('서버에 연결되지 않았어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(listRooms).not.toHaveBeenCalled();
  });

  it('다시 연결하는 중이면 그렇게 알린다', () => {
    ctx.status = 'disconnected';
    render(<BattleLobby />);
    expect(screen.getByText('서버에 다시 연결하는 중이에요…')).toBeInTheDocument();
  });

  describe('빠른 참가·배치 (games-polish P7)', () => {
    const summary = (code: string, playerCount: number, extra: Partial<RoomSummary> = {}): RoomSummary => ({
      code,
      name: `방 ${code}`,
      playerCount,
      maxPlayers: 4,
      locked: false,
      status: 'WAITING',
      ...extra,
    });

    beforeEach(() => {
      push.mockReset();
      toastFn.mockReset();
      listRooms.mockResolvedValue({ ok: true, data: [] });
    });

    it('방 목록이 이름 카드 바로 다음 — 방 만들기·코드 입장보다 위', async () => {
      ctx.rooms = [];
      render(<BattleLobby />);
      await act(async () => {});
      const list = screen.getByRole('region', { name: '방 목록' });
      const create = screen.getByRole('heading', { name: '방 만들기' });
      const code = screen.getByLabelText('코드로 입장');
      expect(list.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(list.compareDocumentPosition(code) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('잠기지 않은 대기 방 중 사람이 가장 많은 곳으로 들어간다', async () => {
      ctx.rooms = [summary('AAAAA2', 1), summary('BBBBB2', 3, { locked: true }), summary('CCCCC2', 2), summary('DDDDD2', 3, { status: 'PLAYING' })];
      render(<BattleLobby />);
      await act(async () => {});
      fireEvent.click(screen.getByRole('button', { name: '빠른 참가' }));
      expect(push).toHaveBeenCalledWith('/games/tetris/battle/CCCCC2');
    });

    it('들어갈 방이 없으면 방 만들기로 안내 — 방 이름 칸에 포커스', async () => {
      ctx.rooms = [summary('BBBBB2', 3, { locked: true })];
      render(<BattleLobby />);
      await act(async () => {});
      fireEvent.click(screen.getByRole('button', { name: '빠른 참가' }));
      expect(push).not.toHaveBeenCalled();
      expect(toastFn).toHaveBeenCalledWith(expect.stringContaining('방을 만들어'));
      expect(screen.getByLabelText(/방 이름/)).toHaveFocus();
    });
  });
});
