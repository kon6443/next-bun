// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LobbyChatMessage } from '@/types/tetrisBattleSocket';

type Handler = (payload: unknown) => void;
type AckHandler = (payload: unknown) => unknown;

/** 대전 소켓 대역 — on/off·emit(응답 없음)·timeout().emitWithAck(응답)를 기록한다 */
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

const ctx = vi.hoisted(() => ({ value: { socket: null as unknown, status: 'connected' } }));
vi.mock('../contexts/BattleSocketContext', () => ({ useBattleSocket: () => ctx.value }));

import { mergeLobbyMessages } from '../hooks/useLobbyChat';
import { LobbyChatPanel } from './LobbyChatPanel';

const msg = (id: string, over: Partial<LobbyChatMessage> = {}): LobbyChatMessage => ({
  id,
  senderKey: `k-${id}`,
  name: `사람${id}`,
  isGuest: false,
  text: `글${id}`,
  at: new Date(Date.UTC(2026, 9, 27, 1, Number(id))).toISOString(),
  ...over,
});
const joinOk = (messages: LobbyChatMessage[], isGuest = true) => () => ({ ok: true, data: { messages, me: { isGuest, name: isGuest ? null : '나', senderKey: 'k-me' }, onlineCount: 7 } });

let io: ReturnType<typeof fakeSocket>;
const resolveGuestName = vi.fn(() => '게스트이름');
const onGuestNameError = vi.fn();

async function renderPanel() {
  const view = await act(async () => render(<LobbyChatPanel guestName="게스트이름" resolveGuestName={resolveGuestName} onGuestNameError={onGuestNameError} />));
  return view;
}
const typeAndSend = async (text: string) => {
  fireEvent.change(screen.getByLabelText('보낼 글'), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '보내기' }));
  });
};
const joins = () => io.emitted.filter((e) => e.event === 'joinLobbyChat').length;
const leaves = () => io.emitted.filter((e) => e.event === 'leaveLobbyChat').length;

beforeEach(() => {
  io = fakeSocket();
  ctx.value = { socket: io.socket, status: 'connected' };
  resolveGuestName.mockClear();
  onGuestNameError.mockClear();
  window.localStorage.clear();
});

describe('로비 채팅 (tetris-chat)', () => {
  it('연결되면 들어가 최근 글·참여자 수를 보이고, 게스트 글에는 "게스트" 표시 — 이름·글은 HTML이 아니라 글자로', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1', { isGuest: true, name: '<b>운영자</b>', text: '<img src=x onerror=alert(1)>' }), msg('2')]);
    await renderPanel();
    expect(joins()).toBe(1);
    expect(screen.getByText('들어올 때 7명')).toBeTruthy();
    const guest = screen.getByTestId('lobby-chat-message-1');
    expect(within(guest).getByTestId('lobby-chat-guest').textContent).toBe('게스트');
    expect(guest.textContent).toContain('<b>운영자</b>');
    expect(guest.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(guest.querySelector('b, img')).toBeNull();
    expect(within(screen.getByTestId('lobby-chat-message-2')).queryByTestId('lobby-chat-guest')).toBeNull();
    expect(screen.getByRole('log', { name: '로비 채팅 글' })).toBeTruthy();
  });

  it('방송으로 온 글을 붙이고, 보내기 ack 글과 방송이 겹쳐도 한 번만', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    io.acks.lobbyChat = () => ({ ok: true, data: { message: msg('9', { senderKey: 'me', name: '게스트이름', isGuest: true, text: '안녕' }) } });
    await renderPanel();
    act(() => io.fire('lobbyChatMessage', msg('3')));
    expect(screen.getByTestId('lobby-chat-message-3')).toBeTruthy();
    await typeAndSend('안녕');
    act(() => io.fire('lobbyChatMessage', msg('9', { senderKey: 'me', name: '게스트이름', isGuest: true, text: '안녕' })));
    expect(screen.getAllByTestId('lobby-chat-message-9')).toHaveLength(1);
    // 보낸 뒤 입력이 비고, 내 글은 숨기기 메뉴가 없다
    expect((screen.getByLabelText('보낼 글') as HTMLInputElement).value).toBe('');
    expect(within(screen.getByTestId('lobby-chat-message-9')).queryByRole('button')).toBeNull();
  });

  it('게스트는 로비 이름 칸의 이름을 함께 보내고, 로그인은 이름 없이 보낸다', async () => {
    io.acks.joinLobbyChat = joinOk([], true);
    io.acks.lobbyChat = () => ({ ok: true, data: { message: msg('5') } });
    const { unmount } = await renderPanel();
    await typeAndSend('  첫 글  ');
    expect(io.emitted.find((e) => e.event === 'lobbyChat')?.payload).toEqual({ text: '첫 글', name: '게스트이름' });
    unmount();

    io = fakeSocket();
    ctx.value = { socket: io.socket, status: 'connected' };
    io.acks.joinLobbyChat = joinOk([], false);
    io.acks.lobbyChat = () => ({ ok: true, data: { message: msg('6') } });
    await renderPanel();
    await typeAndSend('로그인 글');
    expect(io.emitted.find((e) => e.event === 'lobbyChat')?.payload).toEqual({ text: '로그인 글' });
    expect(resolveGuestName).toHaveBeenCalledTimes(1);
  });

  it('게스트 이름이 규칙에 맞지 않으면(이름 칸이 알린다) 보내지 않는다', async () => {
    io.acks.joinLobbyChat = joinOk([], true);
    resolveGuestName.mockReturnValueOnce(null as unknown as string);
    await renderPanel();
    await typeAndSend('글');
    expect(io.emitted.some((e) => e.event === 'lobbyChat')).toBe(false);
    expect((screen.getByLabelText('보낼 글') as HTMLInputElement).value).toBe('글');
  });

  it('서버가 게스트 이름을 거절하면 이름 칸으로, 도배 한도면 안내, 입력은 남긴다', async () => {
    io.acks.joinLobbyChat = joinOk([], true);
    io.acks.lobbyChat = () => ({ ok: false, code: 'NAME_FORBIDDEN', message: 'x' });
    await renderPanel();
    await typeAndSend('글');
    expect(onGuestNameError).toHaveBeenCalledWith('쓸 수 없는 이름이에요. 다른 이름을 입력해 주세요.');
    io.acks.lobbyChat = () => ({ ok: false, code: 'RATE_LIMITED', message: 'x' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    });
    expect(screen.getByRole('alert').textContent).toBe('너무 빨리 보내고 있어요. 잠시 후 다시 보내 주세요.');
    expect((screen.getByLabelText('보낼 글') as HTMLInputElement).value).toBe('글');
  });

  it('구독이 풀렸다(LOBBY_CHAT_NOT_JOINED)면 다시 들어간다', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    io.acks.lobbyChat = () => ({ ok: false, code: 'LOBBY_CHAT_NOT_JOINED', message: 'x' });
    await renderPanel();
    await typeAndSend('글');
    expect(joins()).toBe(2);
  });

  it('다시 연결되면 다시 들어가 받은 최근 글을 id로 합친다(겹친 글은 한 번), 떠나면 나간다', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1'), msg('2')]);
    const view = await renderPanel();
    // 끊긴 소켓에는 나가기를 보내지 않는다
    io.socket.connected = false;
    ctx.value = { socket: io.socket, status: 'disconnected' };
    view.rerender(<LobbyChatPanel guestName="게스트이름" resolveGuestName={resolveGuestName} onGuestNameError={onGuestNameError} />);
    expect(screen.getByText('연결되면 채팅을 다시 불러와요.')).toBeTruthy();
    expect(leaves()).toBe(0);
    io.acks.joinLobbyChat = joinOk([msg('2'), msg('3')]);
    io.socket.connected = true;
    ctx.value = { socket: io.socket, status: 'connected' };
    await act(async () => {
      view.rerender(<LobbyChatPanel guestName="게스트이름" resolveGuestName={resolveGuestName} onGuestNameError={onGuestNameError} />);
    });
    expect(joins()).toBe(2);
    expect(screen.getAllByTestId(/^lobby-chat-message-/).map((li) => li.dataset.testid)).toEqual([
      'lobby-chat-message-1',
      'lobby-chat-message-2',
      'lobby-chat-message-3',
    ]);
    view.unmount();
    expect(leaves()).toBe(1);
  });

  it('글이 상한(100)에 닿아 수가 그대로여도 맨 아래에 있으면 새 글로 내려간다 — 위를 읽는 중이면 그대로', async () => {
    const at = (i: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    io.acks.joinLobbyChat = joinOk(Array.from({ length: 100 }, (_, i) => msg(String(i), { at: at(i) })));
    await renderPanel();
    const list = screen.getByTestId('lobby-chat-list');
    const scrollTop = vi.fn();
    let top = 0;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => 5000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, get: () => 300 });
    Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; scrollTop(v); } });
    act(() => io.fire('lobbyChatMessage', msg('100', { at: at(100) })));
    expect(scrollTop).toHaveBeenLastCalledWith(5000);
    // 위로 올려 읽는 중
    top = 1000;
    fireEvent.scroll(list);
    scrollTop.mockClear();
    act(() => io.fire('lobbyChatMessage', msg('101', { at: at(101) })));
    expect(scrollTop).not.toHaveBeenCalled();
  });

  it('me를 받기 전 키와 달라도 이번에 보낸 글은 숨긴 키와 같아도 보이고 숨기기 메뉴가 없다', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1', { senderKey: 'same-ip' })]);
    io.acks.lobbyChat = () => ({ ok: true, data: { message: msg('2', { senderKey: 'same-ip', text: '내 글' }) } });
    await renderPanel();
    fireEvent.click(within(screen.getByTestId('lobby-chat-message-1')).getByRole('button', { name: /사람1/ }));
    fireEvent.click(screen.getByRole('button', { name: '사람1 님 글 숨기기' }));
    expect(screen.queryByTestId('lobby-chat-message-1')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('lobby-chat-list'));
    await typeAndSend('내 글');
    const mine = screen.getByTestId('lobby-chat-message-2');
    expect(within(mine).queryByRole('button')).toBeNull();
  });

  it('me.senderKey와 같은 글은 숨길 수 없다(숨기면 내 글도 가려진다) — 같은 공유기 게스트도, 이름 칸을 바꿔도', async () => {
    window.localStorage.setItem('tetris:lobbyChatHidden', JSON.stringify(['k-me']));
    io.acks.joinLobbyChat = joinOk([
      msg('1', { senderKey: 'k-me', isGuest: true, name: '게스트이름' }),
      msg('2', { senderKey: 'k-me', isGuest: true, name: '옆자리' }),
      msg('3', { senderKey: 'k-other', isGuest: true, name: '게스트이름' }),
    ]);
    const view = await renderPanel();
    // 내 키가 숨김 목록에 있어도 보인다, 메뉴도 없다
    for (const id of ['1', '2']) expect(within(screen.getByTestId(`lobby-chat-message-${id}`)).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: '모두 보이기' })).toBeNull();
    // 이름만 같은 다른 키는 남의 글
    expect(within(screen.getByTestId('lobby-chat-message-3')).getByRole('button')).toBeTruthy();
    // 이름 칸을 바꿔도 보이기는 그대로 — 색만 바뀐다
    const name = () => within(screen.getByTestId('lobby-chat-message-1')).getByText('게스트이름');
    expect(name().className).toContain('text-sky-300');
    view.rerender(<LobbyChatPanel guestName="새이름" resolveGuestName={resolveGuestName} onGuestNameError={onGuestNameError} />);
    expect(screen.getByTestId('lobby-chat-message-1')).toBeTruthy();
    expect(within(screen.getByTestId('lobby-chat-message-1')).queryByRole('button')).toBeNull();
    expect(name().className).not.toContain('text-sky-300');
  });

  it('로그인 사용자는 senderKey만으로 내 글(이름과 무관)', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1', { senderKey: 'k-me', name: '다른이름' }), msg('2', { senderKey: 'k-other' })], false);
    await renderPanel();
    expect(within(screen.getByTestId('lobby-chat-message-1')).queryByRole('button')).toBeNull();
    expect(within(screen.getByTestId('lobby-chat-message-1')).getByText('다른이름').className).toContain('text-sky-300');
    expect(within(screen.getByTestId('lobby-chat-message-2')).getByRole('button')).toBeTruthy();
  });

  it('형식 오류(INVALID_PAYLOAD)는 글 길이 안내', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    io.acks.lobbyChat = () => ({ ok: false, code: 'INVALID_PAYLOAD', message: 'x' });
    await renderPanel();
    await typeAndSend('글');
    expect(screen.getByRole('alert').textContent).toBe('글은 1~100자로 보내 주세요.');
  });

  it('닫기를 누르면 연 글로 포커스가 돌아간다', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1')]);
    await renderPanel();
    const row = within(screen.getByTestId('lobby-chat-message-1')).getByRole('button', { name: /사람1/ });
    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(document.activeElement).toBe(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('보내면 바로 비워 기다리는 동안 이어 친 글만 남기고, 다시 들어가는 중에도 입력칸은 열려 있다(나가기 없이 다시 들어간다)', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    let resolve!: (v: unknown) => void;
    io.acks.lobbyChat = () => new Promise((r) => (resolve = r));
    await renderPanel();
    const input = screen.getByLabelText('보낼 글') as HTMLInputElement;
    await typeAndSend('첫 글');
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '둘째' } });
    await act(async () => resolve({ ok: true, data: { message: msg('7') } }));
    expect(input.value).toBe('둘째');

    io.acks.lobbyChat = () => ({ ok: false, code: 'LOBBY_CHAT_NOT_JOINED', message: 'x' });
    io.acks.joinLobbyChat = () => new Promise(() => {});
    input.focus();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    });
    expect(joins()).toBe(2);
    expect(leaves()).toBe(0);
    expect(input.value).toBe('둘째');
    expect(input).not.toBeDisabled();
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('남의 글을 눌러 그 사람을 숨긴다(이 브라우저에 저장) — 모두 보이기로 되돌린다', async () => {
    io.acks.joinLobbyChat = joinOk([msg('1', { senderKey: 'spam' }), msg('2', { senderKey: 'spam' }), msg('3')]);
    await renderPanel();
    fireEvent.click(within(screen.getByTestId('lobby-chat-message-1')).getByRole('button', { name: /사람1/ }));
    fireEvent.click(screen.getByRole('button', { name: '사람1 님 글 숨기기' }));
    expect(screen.queryByTestId('lobby-chat-message-1')).toBeNull();
    expect(screen.queryByTestId('lobby-chat-message-2')).toBeNull();
    expect(screen.getByTestId('lobby-chat-message-3')).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('tetris:lobbyChatHidden')!)).toEqual(['spam']);
    expect(screen.getByText(/숨긴 사람 1명/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '모두 보이기' }));
    expect(screen.getByTestId('lobby-chat-message-1')).toBeTruthy();
  });

  it('붙여넣은 탭은 공백으로(줄바꿈은 한 줄 입력칸이 이미 걸러 낸다), 글자 수는 코드포인트로 세고 100자를 넘으면 보내지 못한다', async () => {
    io.acks.joinLobbyChat = joinOk([]);
    await renderPanel();
    const input = screen.getByLabelText('보낼 글') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '첫줄\t둘째줄' } });
    expect(input.value).toBe('첫줄 둘째줄');
    fireEvent.change(input, { target: { value: '😀'.repeat(100) } });
    expect(screen.getByText('100/100')).toBeTruthy();
    expect(screen.getByRole('button', { name: '보내기' })).not.toBeDisabled();
    fireEvent.change(input, { target: { value: '😀'.repeat(101) } });
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled();
  });

  it('들어가지 못하면 다시 시도', async () => {
    io.acks.joinLobbyChat = () => ({ ok: false, code: 'RATE_LIMITED', message: 'x' });
    await renderPanel();
    io.acks.joinLobbyChat = joinOk([msg('1')]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    });
    expect(screen.getByTestId('lobby-chat-message-1')).toBeTruthy();
  });
});

describe('mergeLobbyMessages', () => {
  it('id로 겹침을 거르고 시각 순, 상한 100', () => {
    const many = Array.from({ length: 120 }, (_, i) => msg(String(i), { at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
    const merged = mergeLobbyMessages(many.slice(0, 60), many.slice(50));
    expect(merged).toHaveLength(100);
    expect(merged[0].id).toBe('20');
    expect(merged.at(-1)!.id).toBe('119');
  });
});
