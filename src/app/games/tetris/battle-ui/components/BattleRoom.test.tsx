// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { JoinRoomPayload } from '@/types/tetrisBattleSocket';

type JoinResult = { ok: true; data: unknown } | { ok: false; code: string };
type JoinOptions = { retrySeatInUse?: boolean; onSeatWait?: () => void } | undefined;
const joinRoom = vi.fn<(payload: JoinRoomPayload, options: JoinOptions) => Promise<JoinResult>>();
const clearRoomNotice = vi.fn();
const reconnect = vi.fn();
const ctx = {
  status: 'connected' as 'connected' | 'disconnected' | 'failed',
  room: null,
  roomNotice: null as { code: string; message: string; replaced?: boolean; kicked?: boolean } | null,
  clearRoomNotice,
  joinRoom: (payload: JoinRoomPayload, _scope: unknown, options?: JoinOptions) => joinRoom(payload, options),
  leaveRoom: vi.fn(),
  reconnect: () => reconnect(),
};
vi.mock('../contexts/BattleSocketContext', () => ({
  useBattleSocket: () => ctx,
  useEnterScope: () => ({ cancelled: false }),
}));
const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const toast = vi.fn();
vi.mock('react-hot-toast', () => ({ default: Object.assign((...a: unknown[]) => toast(...a), { success: vi.fn(), error: vi.fn() }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('./RoomStage', () => ({ RoomStage: () => null }));
const reload = { value: false };
// 문서당 한 번만 true인 실제 동작을 흉내 낸다
vi.mock('../lib/pageReload', () => ({
  consumeReloadEntry: () => {
    const value = reload.value;
    reload.value = false;
    return value;
  },
}));

import { BattleRoom } from './BattleRoom';
import { saveRoomSession } from '../lib/roomSession';

const CODE = 'ABC234';

async function submitForm(name = '나') {
  fireEvent.change(await screen.findByLabelText('내 이름'), { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '입장' }));
  });
}

describe('BattleRoom 입장', () => {
  beforeEach(() => {
    window.localStorage.clear();
    joinRoom.mockReset();
    clearRoomNotice.mockReset();
    reload.value = false;
    router.replace.mockReset();
    toast.mockReset();
    ctx.roomNotice = null;
    ctx.status = 'connected';
    reconnect.mockReset();
  });

  it('자동 입장이 응답 없이 실패한 뒤 폼으로 들어가도 저장된 토큰을 싣는다 — 자리가 하나 더 생기지 않게 (FE-01)', async () => {
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    joinRoom.mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' }).mockResolvedValueOnce({ ok: true, data: {} });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('서버 응답이 없어요');
    await submitForm();
    expect(joinRoom).toHaveBeenCalledTimes(2);
    expect(joinRoom.mock.calls[1][0]).toEqual(expect.objectContaining({ code: CODE, playerToken: 'secret' }));
  });

  it('폼 입장에 실은 토큰이 무효면 토큰 없이 새로 들어간다', async () => {
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'stale', playerName: '나' });
    joinRoom
      .mockResolvedValueOnce({ ok: false, code: 'TIMEOUT' })
      .mockResolvedValueOnce({ ok: false, code: 'INVALID_PLAYER_TOKEN' })
      .mockResolvedValueOnce({ ok: true, data: {} });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    await screen.findByRole('alert');
    await submitForm();
    expect(joinRoom).toHaveBeenCalledTimes(3);
    expect(joinRoom.mock.calls[2][0].playerToken).toBeUndefined();
  });

  it('이 방 화면을 새로고침한 경우에만 SEAT_IN_USE를 잠시 간격으로 다시 묻는다(컨텍스트에 맡김), 그래도 거부면 안내', async () => {
    reload.value = true;
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    joinRoom.mockResolvedValue({ ok: false, code: 'SEAT_IN_USE' });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('다른 탭이나 기기에서 이 방의 경기를 하고 있어요');
    expect(joinRoom).toHaveBeenCalledTimes(1);
    expect(joinRoom.mock.calls[0][1]).toEqual(expect.objectContaining({ retrySeatInUse: true }));
  });

  it('새로고침 뒤여도 "이 탭에서 계속하기"는 SEAT_IN_USE를 다시 묻지 않는다', async () => {
    reload.value = true;
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    ctx.roomNotice = { code: CODE, message: '넘겨받힘', replaced: true };
    joinRoom.mockResolvedValue({ ok: false, code: 'SEAT_IN_USE' });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: '이 탭에서 계속하기' }));
    });
    expect(joinRoom.mock.calls[0][1]).toEqual(expect.objectContaining({ retrySeatInUse: false }));
  });

  it('새 탭·링크로 연 방은 SEAT_IN_USE를 다시 묻지 않는다 — 다른 탭이 잠깐 끊긴 틈에 자리를 가져가 기권시키지 않게', async () => {
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    joinRoom.mockResolvedValue({ ok: false, code: 'SEAT_IN_USE' });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    await screen.findByRole('alert');
    expect(joinRoom.mock.calls[0][1]).toEqual(expect.objectContaining({ retrySeatInUse: false }));
  });

  it('SEAT_IN_USE로 기다리기 시작하면 "이전 연결을 정리하는 중…"을 보인다', async () => {
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    joinRoom.mockImplementation((_payload, options) => {
      options?.onSeatWait?.();
      return new Promise(() => {});
    });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    expect(await screen.findByText('이전 연결을 정리하는 중…')).toBeInTheDocument();
  });

  it('방장이 내보냈으면 안내하고 로비로, 자동 입장하지 않는다', async () => {
    ctx.roomNotice = { code: CODE, message: '방장이 방에서 내보냈어요.', kicked: true };
    render(<BattleRoom code={CODE} lockedHint={false} />);
    await act(async () => {});
    expect(toast).toHaveBeenCalledWith('방장이 방에서 내보냈어요.', { id: 'battle-kicked' });
    expect(router.replace).toHaveBeenCalledWith('/games/tetris/battle');
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('방 화면을 떠나면 이 방 안내를 지운다 — 다시 들어오면 자동 입장부터', () => {
    joinRoom.mockResolvedValue({ ok: true, data: {} });
    const view = render(<BattleRoom code={CODE} lockedHint={false} />);
    view.unmount();
    expect(clearRoomNotice).toHaveBeenCalledWith(CODE);
  });

  it('다른 탭·기기가 넘겨받은 방이면 자동으로 되찾지 않고, "이 탭에서 계속하기"로만 저장된 토큰으로 들어간다', async () => {
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    ctx.roomNotice = { code: CODE, message: '다른 탭이나 기기에서 이 방에 들어가 여기서는 나왔어요.', replaced: true };
    joinRoom.mockResolvedValue({ ok: true, data: {} });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    const resume = await screen.findByRole('button', { name: '이 탭에서 계속하기' });
    expect(joinRoom).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(resume);
    });
    expect(joinRoom).toHaveBeenCalledTimes(1);
    expect(joinRoom.mock.calls[0][0]).toEqual(expect.objectContaining({ playerToken: 'secret' }));
  });

  it('연결이 끝내 실패하면 "입장하는 중" 스피너 대신 안내와 다시 연결 버튼 (FE-33)', () => {
    ctx.status = 'failed';
    render(<BattleRoom code={CODE} lockedHint={false} />);
    expect(screen.queryByRole('status', { name: '입장하는 중' })).toBeNull();
    expect(screen.getByText('서버에 연결되지 않았어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 연결' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('다시 연결하는 중이면 그렇게 알린다 (FE-33)', () => {
    ctx.status = 'disconnected';
    render(<BattleRoom code={CODE} lockedHint={false} />);
    expect(screen.getByText('서버에 다시 연결하는 중이에요…')).toBeInTheDocument();
  });

  it('자동 입장이 일시 장애(SERVICE_UNAVAILABLE)로 거절되면 문구와 함께 입장 폼으로 — 다시 시도할 수 있다 (BT-03)', async () => {
    saveRoomSession(CODE, { playerId: 'p1', playerToken: 'secret', playerName: '나' });
    joinRoom.mockResolvedValueOnce({ ok: false, code: 'SERVICE_UNAVAILABLE' }).mockResolvedValueOnce({ ok: true, data: {} });
    render(<BattleRoom code={CODE} lockedHint={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('잠시 후 다시 시도해 주세요');
    expect(screen.getByRole('button', { name: '입장' })).toBeEnabled();
    await submitForm();
    expect(joinRoom.mock.calls[1][0]).toEqual(expect.objectContaining({ playerToken: 'secret' }));
  });
});
