// @vitest-environment jsdom
import { describe, it, expect, expectTypeOf, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CreateRoomPayload, EnterRoomAckData, FortressErrorCode, JoinRoomPayload, RoomPlayer, RoomState, RoomSummary } from '@/types/fortressSocket';
import { type BattleRoomCoreValue, useBattleRoomCore } from '../contexts/useBattleRoomCore';
import { BattleLobbyView } from './BattleLobbyView';
import { WaitingRoomView } from './WaitingRoomView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

/**
 * 공용 방 코어·대기실·로비가 포트리스 타입으로 쓰인다(F3b) — 컴파일이 1차 검증(타입체크가 이 파일도 본다)
 * 런타임은 포트리스가 쓸 슬롯(시작 조건·플레이어 칸·설정 패널·목록 줄)이 그려지는지만 본다. 포트리스 화면 자체는 F5
 */
type FortressRoomCore = BattleRoomCoreValue<RoomState, RoomSummary, CreateRoomPayload, JoinRoomPayload, EnterRoomAckData['rejoin'], FortressErrorCode>;


const player = (playerId: string, team: 0 | 1, extra: Partial<RoomPlayer> = {}): RoomPlayer => ({
  playerId,
  name: playerId,
  ready: true,
  connected: true,
  isGuest: false,
  extra: { team, tankId: 1, skin: { id: 'default', level: 1 } },
  ...extra,
});

const room: RoomState = {
  code: 'ABC234',
  name: '포트리스 방',
  mode: 'team',
  mapId: 'random',
  maxPlayers: 4,
  locked: false,
  hostId: 'p1',
  status: 'WAITING',
  players: [player('p1', 0), player('p2', 0), player('p3', 1)],
};

const ok = async () => ({ ok: true as const });
const api = { myPlayerId: 'p1', chat: [], emotes: {}, setReady: ok, startMatch: ok, sendChat: ok, sendEmote: ok, kickPlayer: ok };

describe('공용 대기실·로비 — 포트리스 타입', () => {
  it('방 코어 — 포트리스 타입으로 인스턴스화된다(타입만, 훅은 부르지 않는다)', () => {
    const core = useBattleRoomCore<RoomState, RoomSummary, CreateRoomPayload, JoinRoomPayload, EnterRoomAckData['rejoin'], FortressErrorCode>;
    expectTypeOf(core).returns.toEqualTypeOf<FortressRoomCore>();
    expectTypeOf<FortressRoomCore['room']>().toEqualTypeOf<RoomState | null>();
    expectTypeOf<FortressRoomCore['createRoom']>().parameter(0).toEqualTypeOf<CreateRoomPayload>();
    expectTypeOf<Parameters<FortressRoomCore['registerMatchSync']>[0]['onRejoin']>().parameter(0).toEqualTypeOf<EnterRoomAckData['rejoin'] | undefined>();
  });

  it('대기실: 게임별 시작 조건·안내·플레이어 칸·설정 패널', () => {
    const teamBalanced = (r: RoomState) => r.players.filter((p) => p.extra.team === 0).length === 2 && r.players.filter((p) => p.extra.team === 1).length === 2;
    render(
      <WaitingRoomView
        room={room}
        connection="connected"
        onReconnect={() => {}}
        onExit={() => {}}
        onCopyInvite={() => {}}
        api={api}
        errorMessage={(code) => code}
        canStart={teamBalanced}
        startHint={() => '팀을 2:2로 맞춰야 시작할 수 있어요.'}
        settingsPanel={<p>모드 팀전</p>}
        renderPlayerExtra={(p, { isMe }) => <span>{`팀 ${p.extra.team}${isMe ? ' (나)' : ''}`}</span>}
      />,
    );
    expect(screen.getByText('모드 팀전')).toBeInTheDocument();
    expect(screen.getByText('팀 0 (나)')).toBeInTheDocument();
    expect(screen.getAllByText('팀 1')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled();
    expect(screen.getByText('팀을 2:2로 맞춰야 시작할 수 있어요.')).toBeInTheDocument();
  });

  it('로비: 목록 줄·방 만들기 칸 슬롯', () => {
    const summary: RoomSummary = { code: 'ABC234', name: '열린 방', playerCount: 2, maxPlayers: 4, locked: false, status: 'WAITING', mode: 'team', mapId: 'canyon' };
    render(
      <BattleLobbyView<RoomSummary, CreateRoomPayload>
        api={{ status: 'connected', rooms: [summary], room: null, listRooms: async () => ({ ok: true, data: [summary] }), createRoom: async () => ({ ok: false, code: 'TIMEOUT' }), leaveRoom: async () => {}, reconnect: () => {} }}
        enterScope={{ cancelled: false }}
        player={{ name: '', change: () => {}, resolve: () => ({ name: null, error: '이름' }), remember: () => {} }}
        errorMessage={(code) => code}
        roomPath={(code) => `/games/fortress/battle/${code}`}
        back={{ href: '/games/fortress', label: '포트리스' }}
        intro={{ title: '친구와 포트리스', description: '2~4명' }}
        playerCounts={[2, 3, 4]}
        createFields={<p>모드·맵 고르기</p>}
        createPayload={{ mode: 'team', mapId: 'random' }}
        renderRoomMeta={(r) => `${r.playerCount}/${r.maxPlayers}명 · ${r.mode === 'team' ? '팀전' : '개인전'}`}
      />,
    );
    expect(screen.getByText('모드·맵 고르기')).toBeInTheDocument();
    expect(screen.getByText('2/4명 · 팀전')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '입장' })).toHaveAttribute('href', '/games/fortress/battle/ABC234');
  });

  it('로비: 포트리스 방 만들기는 mode·mapId 없이 컴파일되지 않는다(타입만)', () => {
    type Props = Parameters<typeof BattleLobbyView<RoomSummary, CreateRoomPayload>>[0];
    // @ts-expect-error createPayload(mode·mapId)가 빠졌다
    const missing: Pick<Props, 'createPayload'> = {};
    expectTypeOf(missing).not.toBeNever();
  });
});
