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

describe('BattleView 이모트 창 (games-polish FE-31)', () => {
  const renderPlain = () =>
    render(
      <BattleView play={play} meId="p1" opponents={[]} emotes={{}} trailsRootRef={{ current: null }} onEmote={vi.fn()} onExit={vi.fn()} />,
    );

  it('열면 첫 이모트로 포커스, Esc로 닫으면 토글로 돌아온다', () => {
    renderPlain();
    const toggle = screen.getByRole('button', { name: '이모트' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = document.getElementById('battle-emote-panel')!;
    expect(panel.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.getElementById('battle-emote-panel')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('바깥을 누르면 닫힌다 — 판을 가린 채 남지 않게, 창 안을 누르면 그대로', () => {
    renderPlain();
    fireEvent.click(screen.getByRole('button', { name: '이모트' }));
    const panel = document.getElementById('battle-emote-panel')!;
    fireEvent.pointerDown(panel);
    expect(document.getElementById('battle-emote-panel')).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(document.getElementById('battle-emote-panel')).toBeNull();
  });
});


describe('BattleView 미니보드 칸 — 가로 휴대폰 (보드 크기 A0)', () => {
  /** 매체 질의 대역 — 넓음(폭 640 이상)만 맞고 높이는 낮은 화면(844×390 가로 휴대폰) */
  const landscapePhone = () =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('min-width: 640px') && !query.includes('min-height'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );

  it('폭만 넓고 높이가 낮으면 작은 칸 — 큰 미니보드가 헤더를 키워 판이 잘리지 않게', () => {
    const spy = landscapePhone();
    render(
      <BattleView play={play} meId="p1" opponents={[opponent('p2', '친구')]} emotes={{}} trailsRootRef={{ current: null }} onEmote={vi.fn()} onExit={vi.fn()} />,
    );
    expect(screen.getByText('친구').getAttribute('data-cell')).toBe('6');
    spy.mockRestore();
  });
});

describe('BattleView 상대 판 자리 — 세로 화면 높이가 한계면 판 옆 줄 (보드 크기 A)', () => {
  const media = (portrait: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ matches: query === '(orientation: portrait)' ? portrait : false, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
  /** 판 영역(헤더·패드를 뺀 줄) 크기 — 모든 요소가 같은 크기를 돌려주지만 판정은 이 줄만 잰다 */
  const rowSize = (width: number, height: number) =>
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
  const renderOne = () =>
    render(
      <BattleView play={play} meId="p1" opponents={[opponent('p2', '친구')]} emotes={{}} trailsRootRef={{ current: null }} onEmote={vi.fn()} onExit={vi.fn()} />,
    );

  it('375×667 1명(판 영역 375×292, 높이가 한계) — 옆 줄로 옮긴다: 셀 12 → 17 계산, 미니보드는 공격 궤적 기준점 그대로', () => {
    const spies = [media(true), rowSize(375, 292)];
    renderOne();
    expect(screen.getByTestId('opponents-side')).toBeInTheDocument();
    expect(screen.queryByTestId('opponents-header')).toBeNull();
    expect(screen.getByText('친구').closest('[data-attack-anchor]')?.getAttribute('data-attack-anchor')).toBe('p2');
    spies.forEach((s) => s.mockRestore());
  });

  it('390×844 1명(판 영역 390×463, 폭이 한계) — 헤더 그대로: 옆 줄이면 셀이 20 → 18로 준다', () => {
    const spies = [media(true), rowSize(390, 463)];
    renderOne();
    expect(screen.getByTestId('opponents-header')).toBeInTheDocument();
    spies.forEach((s) => s.mockRestore());
  });

  it('가로 화면은 대상이 아니다 — 높이가 한계여도 헤더 그대로', () => {
    const spies = [media(false), rowSize(844, 161)];
    renderOne();
    expect(screen.getByTestId('opponents-header')).toBeInTheDocument();
    spies.forEach((s) => s.mockRestore());
  });
});
