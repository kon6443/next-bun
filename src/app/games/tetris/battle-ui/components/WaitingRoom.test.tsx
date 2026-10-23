// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { RoomPlayer, RoomState } from '@/types/tetrisBattleSocket';

const kickPlayer = vi.fn();
const ctx = {
  myPlayerId: 'p1',
  chat: [],
  emotes: {},
  setReady: vi.fn(),
  startMatch: vi.fn(),
  sendChat: vi.fn(),
  sendEmote: vi.fn(),
  kickPlayer: (id: string) => kickPlayer(id),
};
vi.mock('../contexts/BattleSocketContext', () => ({ useBattleSocket: () => ctx }));

import { WaitingRoom } from './WaitingRoom';
import { OFFLINE_GRACE_MS } from '../hooks/useOfflineCountdown';

const player = (playerId: string, name: string, connected = true): RoomPlayer => ({ playerId, name, ready: false, connected, isGuest: true });
const room = (players: RoomPlayer[], hostId = 'p1', status: RoomState['status'] = 'WAITING'): RoomState => ({
  code: 'ABC234',
  name: '방',
  maxPlayers: 4,
  locked: false,
  hostId,
  status,
  players,
});

const renderRoom = (r: RoomState) =>
  render(<WaitingRoom room={r} connection="connected" onReconnect={vi.fn()} onExit={vi.fn()} onCopyInvite={vi.fn()} />);

describe('WaitingRoom 접속 표시·내보내기 (D-010·D-011)', () => {
  beforeEach(() => {
    kickPlayer.mockReset();
    ctx.myPlayerId = 'p1';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('온라인·오프라인을 보이고, 대기 중에 끊기는 것을 본 자리는 정리까지 남은 초를 센다', () => {
    vi.useFakeTimers();
    const view = renderRoom(room([player('p1', '나'), player('p2', '친구')]));
    view.rerender(
      <WaitingRoom room={room([player('p1', '나'), player('p2', '친구', false)])} connection="connected" onReconnect={vi.fn()} onExit={vi.fn()} onCopyInvite={vi.fn()} />,
    );
    const friend = screen.getByText('친구').closest('li') as HTMLElement;
    expect(within(friend).getByText(/오프라인/)).toBeInTheDocument();
    expect(within(friend).getByText(`· 곧 자리 정리 ${OFFLINE_GRACE_MS / 1000}초`)).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(within(friend).getByText(`· 곧 자리 정리 ${OFFLINE_GRACE_MS / 1000 - 3}초`)).toBeInTheDocument();
    expect(within(screen.getByText('나').closest('li') as HTMLElement).getByText('온라인')).toBeInTheDocument();
  });

  it('처음 볼 때 이미 오프라인인 자리는(끊긴 시각을 모른다) 세지 않고 "오프라인"만', () => {
    renderRoom(room([player('p1', '나'), player('p2', '친구', false)]));
    const friend = screen.getByText('친구').closest('li') as HTMLElement;
    expect(within(friend).getByText(/오프라인/)).toBeInTheDocument();
    expect(within(friend).queryByText(/곧 자리 정리/)).toBeNull();
  });

  it('방장이 오프라인이면 기다리는 사람에게 곧 넘어간다고 알린다', () => {
    ctx.myPlayerId = 'p2';
    renderRoom(room([player('p1', '방장', false), player('p2', '나')]));
    expect(screen.getByText('방장이 오프라인이에요. 곧 다른 사람에게 방장이 넘어가요.')).toBeInTheDocument();
  });

  it('방장만 다른 참가자를 내보낼 수 있고, 확인 뒤 kickPlayer', async () => {
    kickPlayer.mockResolvedValue({ ok: true, data: {} });
    renderRoom(room([player('p1', '나'), player('p2', '친구')]));
    const buttons = screen.getAllByRole('button', { name: '친구 내보내기' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: '내보내기' }));
    });
    expect(kickPlayer).toHaveBeenCalledWith('p2');
  });

  it('방장이 아니면 내보내기 버튼이 없다', () => {
    ctx.myPlayerId = 'p2';
    renderRoom(room([player('p1', '방장'), player('p2', '나')]));
    expect(screen.queryByRole('button', { name: /내보내기/ })).toBeNull();
  });

  it('시작이 성공하면 대전 화면으로 바뀔 때까지 시작 버튼을 잠근 채 둔다 — 실패면 풀고 문구 (FE-34)', async () => {
    const ready = (p: RoomPlayer): RoomPlayer => ({ ...p, ready: true });
    ctx.startMatch = vi.fn().mockResolvedValue({ ok: true });
    const view = renderRoom(room([player('p1', '나'), ready(player('p2', '친구'))]));
    const button = screen.getByRole('button', { name: '게임 시작' });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button).toBeDisabled();
    view.unmount();

    ctx.startMatch = vi.fn().mockResolvedValue({ ok: false, code: 'NOT_ALL_READY' });
    renderRoom(room([player('p1', '나'), ready(player('p2', '친구'))]));
    const again = screen.getByRole('button', { name: '게임 시작' });
    await act(async () => {
      fireEvent.click(again);
    });
    expect(again).toBeEnabled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
