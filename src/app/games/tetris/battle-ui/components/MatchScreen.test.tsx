// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { MatchPhase } from '../hooks/useBattleMatch';
import type { useBattlePlay } from '../hooks/useBattlePlay';

const sendChat = vi.fn();
vi.mock('../contexts/BattleSocketContext', () => ({
  useBattleSocket: () => ({
    emotes: {},
    sendEmote: vi.fn(),
    rematch: vi.fn(),
    kickPlayer: vi.fn(),
    chat: [],
    sendChat: (text: string) => sendChat(text),
  }),
}));
// 대전 화면은 덮개·아래 줄만 확인한다
vi.mock('./BattleView', () => ({
  BattleView: ({ overlay, footer }: { overlay?: ReactNode; footer?: ReactNode }) => (
    <div>
      <div data-testid="overlay">{overlay}</div>
      {footer}
    </div>
  ),
}));

import { MatchScreen } from './MatchScreen';

const renderScreen = (phase: MatchPhase) =>
  render(
    <MatchScreen
      phase={phase}
      play={{} as ReturnType<typeof useBattlePlay>}
      myPlayerId="p1"
      isHost={false}
      opponents={[]}
      targetId={null}
      myKos={0}
      replaySubmit={null}
      trailsRootRef={{ current: null }}
      roomPlayers={[]}
      roomStatus="PLAYING"
      onExit={vi.fn()}
    />,
  );

describe('MatchScreen 경기 중 채팅 (D-016)', () => {
  it('살아 있는 동안은 입력창이 없다(자막만)', () => {
    renderScreen({ kind: 'playing', matchId: 'm1' });
    expect(screen.queryByLabelText('채팅 입력')).toBeNull();
  });

  it('탈락하면 채팅 입력창이 열린다', () => {
    renderScreen({ kind: 'out', matchId: 'm1', place: 3 });
    expect(screen.getByLabelText('채팅 입력')).toBeEnabled();
  });

  it('탈락 직후 서버가 아직 살아 있다고 보고 거절하면(MATCH_ALREADY_STARTED) 잠시 후 다시 보내라고 안내한다', async () => {
    sendChat.mockResolvedValue({ ok: false, code: 'MATCH_ALREADY_STARTED' });
    renderScreen({ kind: 'out', matchId: 'm1', place: 3 });
    fireEvent.change(screen.getByLabelText('채팅 입력'), { target: { value: '안녕' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '보내기' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('잠시 후 다시 보내 주세요');
  });

  it('판이 없어 관전 중이어도 채팅할 수 있다', () => {
    renderScreen({ kind: 'unavailable', forfeited: false });
    expect(screen.getByLabelText('채팅 입력')).toBeEnabled();
  });
});
