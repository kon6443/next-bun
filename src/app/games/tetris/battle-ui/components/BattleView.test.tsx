// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { useBattlePlay } from '../hooks/useBattlePlay';
// MiniBoard는 CSS 모듈을 써서 vitest(Tailwind PostCSS)로 읽지 못한다 — 기준점·크기만 남긴 대역
vi.mock('./MiniBoard', () => ({
  MiniBoard: ({ playerId, name, cell, anchor = true }: { playerId: string; name: string; cell: number; anchor?: boolean }) => (
    <figure data-attack-anchor={anchor ? playerId : undefined} data-cell={cell}>
      {name}
    </figure>
  ),
}));

import { BattleView, type OpponentView } from './BattleView';

beforeAll(() => {
  // jsdom에는 없다 — 화면 폭 판정·크게 본 판 크기 맞추기
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
});

const play = {
  gameRef: { current: null },
  afterTickRef: { current: null },
  effectsRef: { current: null },
  garbageRef: { current: null },
  status: 'over',
  press: vi.fn(),
  release: vi.fn(),
  instant: vi.fn(),
} as unknown as ReturnType<typeof useBattlePlay>;

const opponent = (playerId: string, name: string): OpponentView => ({
  playerId,
  name,
  cells: null,
  pending: 0,
  isTarget: false,
  place: null,
  kos: 0,
  online: true,
});

const renderView = (canEnlarge: boolean) =>
  render(
    <BattleView
      play={play}
      meId="p1"
      opponents={[opponent('p2', '친구'), opponent('p3', '셋째')]}
      emotes={{}}
      trailsRootRef={{ current: null }}
      onEmote={vi.fn()}
      onExit={vi.fn()}
      canEnlarge={canEnlarge}
    />,
  );

describe('BattleView 상대 판 크게 보기 (FE-28)', () => {
  it('관전 중이면 상대 판을 눌러 크게 보고, 돌아가기로 원래 판에 포커스', () => {
    renderView(true);
    const board = screen.getByRole('button', { name: '친구 화면 크게 보기' });
    fireEvent.click(board);
    const back = screen.getByRole('button', { name: '← 내 화면으로' });
    expect(back).toHaveFocus();
    // 크게 본 사본은 공격 궤적 기준점이 아니다 — 같은 상대 기준점은 하나
    expect(document.querySelectorAll('[data-attack-anchor="p2"]')).toHaveLength(1);
    fireEvent.click(back);
    expect(screen.queryByRole('button', { name: '← 내 화면으로' })).toBeNull();
    expect(screen.getByRole('button', { name: '친구 화면 크게 보기' })).toHaveFocus();
  });

  it('내 판이 진행 중이면 크게 볼 수 없다', () => {
    renderView(false);
    expect(screen.queryByRole('button', { name: /크게 보기/ })).toBeNull();
  });
});

describe('BattleView 터치 버튼 자리 (games-polish FE-11)', () => {
  const coarse = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query === '(pointer: coarse)' ? matches : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
  const renderWith = (status: string, reserveControls: boolean) =>
    render(
      <BattleView
        play={{ ...play, status } as unknown as ReturnType<typeof useBattlePlay>}
        meId="p1"
        opponents={[]}
        emotes={{}}
        trailsRootRef={{ current: null }}
        onEmote={vi.fn()}
        onExit={vi.fn()}
        reserveControls={reserveControls}
      />,
    );

  it('카운트다운(판 시작 전)에도 터치 버튼을 미리 그려 시작 순간 판 크기가 바뀌지 않는다', () => {
    const spy = coarse(true);
    renderWith('ready', true);
    expect(screen.getByRole('button', { name: '하드 드롭' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('관전 등 자리를 잡지 않을 때 판이 끝났으면 터치 버튼이 없다', () => {
    const spy = coarse(true);
    renderWith('over', false);
    expect(screen.queryByRole('button', { name: '하드 드롭' })).toBeNull();
    spy.mockRestore();
  });
});
