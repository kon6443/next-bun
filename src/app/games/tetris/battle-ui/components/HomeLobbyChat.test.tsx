// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyChatMessage } from '@/types/tetrisBattleSocket';

type Handler = (payload: unknown) => void;
type AckHandler = (payload: unknown) => unknown;

/** 대전 소켓 대역 — on/off·emit·timeout().emitWithAck를 기록한다 */
function fakeSocket() {
  const handlers = new Map<string, Set<Handler>>();
  const emitted: { event: string; payload: unknown }[] = [];
  const acks: Record<string, AckHandler> = {};
  const socket = {
    connected: true,
    on: (event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
    },
    off: (event: string, handler: Handler) => handlers.get(event)?.delete(handler),
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
    },
    timeout: () => ({
      emitWithAck: async (event: string, payload: unknown) => {
        emitted.push({ event, payload });
        const ack = acks[event];
        return ack ? ack(payload) : new Promise(() => {});
      },
    }),
  };
  const fire = (event: string, payload: unknown) => handlers.get(event)?.forEach((h) => h(payload));
  return { socket, emitted, acks, fire };
}

const reconnect = vi.hoisted(() => vi.fn());
const ctx = vi.hoisted(() => ({ value: { socket: null as unknown, status: 'connected', reconnect } }));
vi.mock('../contexts/BattleSocketContext', () => ({
  BattleSocketProvider: ({ children }: { children: ReactNode }) => children,
  useBattleSocket: () => ctx.value,
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { saveLastName } from '../../lib/storage';
import { HomeLobbyChat } from './HomeLobbyChat';

const msg = (id: string, over: Partial<LobbyChatMessage> = {}): LobbyChatMessage => ({
  id,
  senderKey: `k-${id}`,
  name: `사람${id}`,
  isGuest: false,
  text: `글${id}`,
  at: new Date(Date.UTC(2026, 9, 27, 1, Number(id))).toISOString(),
  ...over,
});
const joinOk = (messages: LobbyChatMessage[]) => () => ({ ok: true, data: { messages, me: { isGuest: true, name: null, senderKey: 'k-me' }, onlineCount: 4 } });

let io: ReturnType<typeof fakeSocket>;
const renderCard = () => act(async () => render(<HomeLobbyChat />));
const send = async (text: string) => {
  fireEvent.change(screen.getByLabelText('로비 채팅에 보낼 글'), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  });
};
const rows = () => screen.queryAllByTestId(/^home-lobby-chat-message-/).map((li) => li.dataset.testid!.replace('home-lobby-chat-message-', ''));

beforeEach(() => {
  io = fakeSocket();
  ctx.value = { socket: io.socket, status: 'connected', reconnect };
  reconnect.mockClear();
  window.localStorage.clear();
});

describe('홈 로비 채팅 카드 (tetris-home-chat)', () => {
  it('최근 3줄만, 머리에 참여자 수·전체 보기(로비 채팅 자리), 새 글이 오면 3줄이 밀린다', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1'), msg('2'), msg('3'), msg('4', { isGuest: true, text: '<b>안녕</b>' })]);
    await renderCard();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('💬 로비 채팅 · 들어올 때 4명');
    expect(screen.getByRole('link', { name: '로비 채팅 전체 보기' }).getAttribute('href')).toBe('/games/tetris/battle#lobby-chat');
    expect(rows()).toEqual(['2', '3', '4']);
    // 게스트 표시·글자 렌더
    const guest = screen.getByTestId('home-lobby-chat-message-4');
    expect(within(guest).getByTestId('lobby-chat-guest').textContent).toBe('게스트');
    expect(guest.textContent).toContain('<b>안녕</b>');
    expect(guest.querySelector('b')).toBeNull();
    act(() => io.fire('lobbyChatMessage', msg('5')));
    expect(rows()).toEqual(['3', '4', '5']);
  });

  it('저장된 이름이 있는 게스트는 바로 보내고, 내 글은 오른쪽 말풍선("나:")', async () => {
    saveLastName('홈손님');
    io.acks.joinLobbyChat = joinOk([msg('1')]);
    io.acks.lobbyChat = () => ({ ok: true, data: { message: msg('9', { senderKey: 'k-me', isGuest: true, name: '홈손님', text: '반가워요' }) } });
    await renderCard();
    expect(screen.queryByLabelText(/채팅에 쓸 이름/)).toBeNull();
    await send('반가워요');
    expect(io.emitted.find((e) => e.event === 'lobbyChat')?.payload).toEqual({ text: '반가워요', name: '홈손님' });
    const mine = screen.getByTestId('home-lobby-chat-message-9');
    expect(mine.className).toContain('justify-end');
    expect(within(mine).getByText('나:')).toBeTruthy();
    expect(screen.getByTestId('home-lobby-chat-message-1').className).toContain('justify-start');
  });

  it('이름이 없는 게스트는 처음 보낼 때만 이름 칸을 펼치고(포커스), 이름을 넣으면 보낸 뒤 접는다', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    io.acks.lobbyChat = () => ({ ok: true, data: { message: msg('9', { senderKey: 'k-me', isGuest: true, name: '새손님' }) } });
    // 다음 프레임(그려진 뒤)에 포커스 — 대기열에 모았다가 act 뒤에 돌린다
    const frames: FrameRequestCallback[] = [];
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return 0;
    });
    await renderCard();
    await send('첫 글');
    frames.splice(0).forEach((cb) => cb(0));
    expect(io.emitted.some((e) => e.event === 'lobbyChat')).toBe(false);
    const name = screen.getByLabelText(/채팅에 쓸 이름/) as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    expect(screen.getByRole('alert').textContent).toBeTruthy();
    // 입력한 글은 그대로
    expect((screen.getByLabelText('로비 채팅에 보낼 글') as HTMLInputElement).value).toBe('첫 글');
    fireEvent.change(name, { target: { value: '새손님' } });
    // 이름 칸에서 Enter(폼 제출) — 보낸 뒤 이름 칸이 사라져도 포커스는 글 입력칸으로
    await act(async () => {
      fireEvent.submit(name);
    });
    expect(io.emitted.find((e) => e.event === 'lobbyChat')?.payload).toEqual({ text: '첫 글', name: '새손님' });
    expect(screen.queryByLabelText(/채팅에 쓸 이름/)).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText('로비 채팅에 보낼 글'));
    raf.mockRestore();
  });

  it('서버가 이름을 거절하면 이름 칸을 펼쳐 알린다', async () => {
    saveLastName('홈손님');
    io.acks.joinLobbyChat = joinOk([]);
    io.acks.lobbyChat = () => ({ ok: false, code: 'NAME_FORBIDDEN', message: 'x' });
    await renderCard();
    await send('글');
    expect(screen.getByLabelText(/채팅에 쓸 이름/)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('쓸 수 없는 이름이에요. 다른 이름을 입력해 주세요.');
  });

  it('로비에서 숨긴 사람은 홈에서도 보이지 않는다(숨기기 메뉴는 로비에만)', async () => {
    window.localStorage.setItem('tetris:lobbyChatHidden', JSON.stringify(['spam']));
    io.acks.joinLobbyChat = joinOk([msg('1', { senderKey: 'spam' }), msg('2')]);
    await renderCard();
    expect(rows()).toEqual(['2']);
    // 숨긴 사람의 새 글도 걸러진다
    act(() => io.fire('lobbyChatMessage', msg('3', { senderKey: 'spam' })));
    expect(rows()).toEqual(['2']);
    expect(within(screen.getByTestId('home-lobby-chat-message-2')).queryByRole('button')).toBeNull();
  });

  it('연결 중이면 "채팅 연결 중…", 연결을 끝내 못 하면 다시 시도 — 입력칸은 열려 있다', async () => {
    ctx.value = { socket: io.socket, status: 'connecting', reconnect };
    const view = await renderCard();
    expect(screen.getByRole('status').textContent).toBe('채팅 연결 중…');
    // 안내는 글 목록(log) 밖 — 알림 영역이 겹치지 않는다
    expect(screen.getByRole('log').contains(screen.getByRole('status'))).toBe(false);
    expect(screen.getByLabelText('로비 채팅에 보낼 글')).not.toBeDisabled();
    ctx.value = { socket: io.socket, status: 'failed', reconnect };
    view.rerender(<HomeLobbyChat />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('빈 채팅에 첫 글이 오면 처음부터 있던 같은 log 영역에 들어간다(스크린리더가 첫 글도 읽는다)', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    await renderCard();
    const log = screen.getByRole('log', { name: '로비 채팅 최근 글' });
    expect(screen.getByRole('status').textContent).toBe('아직 글이 없어요. 먼저 인사해 보세요!');
    act(() => io.fire('lobbyChatMessage', msg('1')));
    expect(screen.getByRole('log', { name: '로비 채팅 최근 글' })).toBe(log);
    expect(log.contains(screen.getByTestId('home-lobby-chat-message-1'))).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('재연결로 안내가 떴다 사라져도 지난 글은 log에서 빠지지 않는다(새 글처럼 다시 읽히지 않게)', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1')]);
    const view = await renderCard();
    const row = screen.getByTestId('home-lobby-chat-message-1');
    io.socket.connected = false;
    ctx.value = { socket: io.socket, status: 'disconnected', reconnect };
    view.rerender(<HomeLobbyChat />);
    expect(screen.getByRole('status').textContent).toBe('채팅 연결 중…');
    expect(screen.getByTestId('home-lobby-chat-message-1')).toBe(row);
    io.socket.connected = true;
    ctx.value = { socket: io.socket, status: 'connected', reconnect };
    await act(async () => {
      view.rerender(<HomeLobbyChat />);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.getByTestId('home-lobby-chat-message-1')).toBe(row);
  });

  it('숨긴 사람의 글만 남으면 그렇게 알린다', async () => {
    window.localStorage.setItem('tetris:lobbyChatHidden', JSON.stringify(['spam']));
    io.acks.joinLobbyChat = joinOk([msg('1', { senderKey: 'spam' })]);
    await renderCard();
    expect(screen.getByRole('status').textContent).toBe('숨긴 사람의 글만 있어요.');
  });

  it('입장 실패 뒤 연결이 끊기면 다시 시도 대신 연결 중(끊긴 동안 다시 들어가기는 아무 일도 안 한다)', async () => {
    io.acks.joinLobbyChat = () => ({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'x' });
    const view = await renderCard();
    ctx.value = { socket: io.socket, status: 'disconnected', reconnect };
    view.rerender(<HomeLobbyChat />);
    expect(screen.getByRole('status').textContent).toBe('채팅 연결 중…');
    expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
  });

  it('입장이 거절되면(SERVICE_UNAVAILABLE 등) 카드 안에서 다시 시도', async () => {
    io.acks.joinLobbyChat = () => ({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'x' });
    await renderCard();
    expect(screen.getByRole('status').textContent).toContain('채팅에 들어가지 못했어요.');
    io.acks.joinLobbyChat = joinOk([msg('1')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(rows()).toEqual(['1']);
  });
});
