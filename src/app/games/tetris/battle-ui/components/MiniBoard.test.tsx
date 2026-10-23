// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from '@/types/tetrisBattleSocket';
import { MiniBoard } from './MiniBoard';

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: () => {},
    fillRect: () => {},
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D);
});

const props = { playerId: 'p2', name: '친구', pending: 0, isTarget: false, place: null, kos: 0, cell: 6 };

describe('MiniBoard (FE-19)', () => {
  it('상대 판이 갱신돼도 크기가 같으면 캔버스 백버퍼를 다시 만들지 않는다 — 크기가 바뀔 때만', () => {
    const setWidth = vi.spyOn(HTMLCanvasElement.prototype, 'width', 'set');
    const view = render(<MiniBoard {...props} cells={new Uint8Array(BOARD_COLS * BOARD_VISIBLE_ROWS)} />);
    const initial = setWidth.mock.calls.length;
    view.rerender(<MiniBoard {...props} cells={new Uint8Array(BOARD_COLS * BOARD_VISIBLE_ROWS).fill(1)} />);
    expect(setWidth.mock.calls.length).toBe(initial);
    view.rerender(<MiniBoard {...props} cell={8} cells={new Uint8Array(BOARD_COLS * BOARD_VISIBLE_ROWS)} />);
    expect(setWidth.mock.calls.length).toBe(initial + 1);
    setWidth.mockRestore();
  });

  it('탈락했지만 순위를 모르면 "탈락", 오프라인이면 표시 (FE-04·D-010)', () => {
    const view = render(<MiniBoard {...props} cells={null} out online={false} />);
    expect(view.getByRole('img', { name: '탈락' })).toBeInTheDocument();
    // 좁은 판(칸 6)에서는 글자가 판 폭을 넘치지 않게 읽어 주기만 한다
    expect(view.getByText('오프라인')).toHaveClass('sr-only');
    view.rerender(<MiniBoard {...props} cell={10} cells={null} out online={false} />);
    expect(view.getByText('오프라인')).not.toHaveClass('sr-only');
  });
});
