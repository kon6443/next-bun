// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { MatchPhase } from '../hooks/useBattleMatch';
import type { useBattlePlay } from '../hooks/useBattlePlay';
import type { ConnectionStatus } from '../contexts/BattleSocketContext';

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
// 대전 화면은 덮개·아래 줄과 넘긴 props(보드 스킨)만 확인한다
const battleViewProps = vi.hoisted(() => vi.fn());
vi.mock('./BattleView', () => ({
  BattleView: (props: { overlay?: ReactNode; footer?: ReactNode }) => {
    battleViewProps(props);
    return (
      <div>
        <div data-testid="overlay">{props.overlay}</div>
        {props.footer}
      </div>
    );
  },
}));

// 내 보드 스킨(useMySkins)은 세션을 본다 — 게스트로 둔다(기본 스킨)
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
// 기록 링크는 공개 대기 폴링(fetch)을 한다 — 렌더 여부만 본다
vi.mock('./MatchRecordLinks', () => ({
  MatchRecordLinks: ({ matchId }: { matchId: string }) => <a data-testid="record-links">{matchId}</a>,
}));

import { MatchScreen } from './MatchScreen';

const renderScreen = (phase: MatchPhase, connection: ConnectionStatus = 'connected', onReconnect = vi.fn()) =>
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
      connection={connection}
      onReconnect={onReconnect}
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

describe('MatchScreen 연결 상태 (games-polish FE-01)', () => {
  it('연결돼 있으면 연결 표시를 띄우지 않는다', () => {
    renderScreen({ kind: 'playing', matchId: 'm1' });
    expect(screen.queryByText('다시 연결하는 중')).toBeNull();
  });

  it('경기 중 끊기면 판 위에 "다시 연결하는 중"을 알린다', () => {
    renderScreen({ kind: 'playing', matchId: 'm1' }, 'disconnected');
    expect(screen.getByTestId('overlay')).toHaveTextContent('다시 연결하는 중');
  });

  it('자동 재시도가 끝나면(failed) 다시 연결 버튼을 준다 — 나가기 말고도 복구할 수 있다', () => {
    const onReconnect = vi.fn();
    renderScreen({ kind: 'playing', matchId: 'm1' }, 'failed', onReconnect);
    fireEvent.click(screen.getByRole('button', { name: /다시 연결/ }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});

describe('MatchScreen 결과 기록 링크 (games-polish FE-24)', () => {
  const ended: MatchPhase = { kind: 'ended', matchId: 'm1', results: [] };

  it('내가 기록을 내지 못했어도(제출 없음·실패) 경기 기록 링크를 준다 — 경기는 마감 뒤 공개된다', () => {
    renderScreen(ended);
    expect(screen.getByTestId('record-links')).toHaveTextContent('m1');
  });

  it('매치 id를 모르면(끊긴 사이 종료) 링크가 없다', () => {
    renderScreen({ kind: 'ended', matchId: null, results: [] });
    expect(screen.queryByTestId('record-links')).toBeNull();
  });
});

describe('MatchScreen 보드 스킨 (D-003)', () => {
  it('상대 판은 그 상대의 players[].skins(block·board), 정보가 없으면(이전 서버·방을 나감) 기본', () => {
    const opponent = (playerId: string) => ({ playerId, name: playerId, cells: null, pending: 0, isTarget: false, place: null, kos: 0 });
    render(
      <MatchScreen
        phase={{ kind: 'playing', matchId: 'm1' }}
        play={{} as ReturnType<typeof useBattlePlay>}
        myPlayerId="p1"
        isHost={false}
        opponents={[opponent('p2'), opponent('p3'), opponent('p4')]}
        targetId={null}
        myKos={0}
        replaySubmit={null}
        trailsRootRef={{ current: null }}
        roomPlayers={[
          { playerId: 'p2', name: 'p2', ready: true, connected: true, isGuest: false, skins: { block: 'neon', effect: 'neon', board: 'gameboy' } },
          { playerId: 'p3', name: 'p3', ready: true, connected: true, isGuest: true },
        ]}
        roomStatus="PLAYING"
        connection="connected"
        onReconnect={vi.fn()}
        onExit={vi.fn()}
      />,
    );
    const { opponents, skins } = battleViewProps.mock.lastCall![0] as {
      opponents: { playerId: string; blockSkinId: string; boardSkinId: string }[];
      skins: { block: string };
    };
    expect(opponents.map((o) => [o.playerId, o.blockSkinId, o.boardSkinId])).toEqual([
      ['p2', 'neon', 'gameboy'],
      ['p3', 'default', 'default'],
      ['p4', 'default', 'default'],
    ]);
    // 내 판은 내 장착 — 게스트면 기본
    expect(skins).toEqual({ block: 'default', effect: 'default', board: 'default' });
  });
});
