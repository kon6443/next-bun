// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mine = vi.hoisted(() => ({ value: { equipped: { block: 'default', effect: 'default', board: 'default', background: 'default' }, levels: { block: 1, effect: 1, board: 1, background: 1 } } }));
vi.mock('../hooks/useMySkins', () => ({ useMySkins: () => mine.value }));
const reduced = vi.hoisted(() => ({ value: false }));
vi.mock('../hooks/useReducedEffects', () => ({ useReducedEffects: () => reduced.value }));

import { backgroundStyle } from '../lib/skins';
import { TetrisGameSurface } from './TetrisGameSurface';

const setBackground = (id: string, level: number) => {
  mine.value = { equipped: { ...mine.value.equipped, background: id }, levels: { ...mine.value.levels, background: level } };
};
const surface = () => document.querySelector<HTMLElement>('[data-game-surface]')!;

beforeEach(() => {
  setBackground('default', 1);
  reduced.value = false;
});

describe('테트리스 화면 바탕 — 배경 스킨 레벨 (skin-levels)', () => {
  it('기본 Lv1 — 스타일 없이 기존 bg-slate-950 그대로', () => {
    render(<TetrisGameSurface>판</TetrisGameSurface>);
    expect(surface().style.background).toBe('');
    expect(screen.queryByTestId('skin-background-drift')).toBeNull();
  });

  it('기본이어도 Lv2부터는 레벨 레이어를 얹는다', () => {
    setBackground('default', 2);
    render(<TetrisGameSurface>판</TetrisGameSurface>);
    expect(surface().getAttribute('style')).toContain('radial-gradient');
    expect(backgroundStyle('default', 2)).not.toBe(backgroundStyle('default', 1));
  });

  it('Lv5 — 떠다니는 빛 레이어(움직임), 연출 줄이기면 멈춘다', () => {
    setBackground('chocolate', 5);
    const { unmount } = render(<TetrisGameSurface>판</TetrisGameSurface>);
    expect(screen.getByTestId('skin-background-drift').style.animation).toContain('skinDrift');
    unmount();
    reduced.value = true;
    render(<TetrisGameSurface>판</TetrisGameSurface>);
    expect(screen.getByTestId('skin-background-drift').style.animation).toBe('');
  });
});
