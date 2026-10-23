// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TouchControls } from './TouchControls';

describe('TouchControls (FE-10)', () => {
  it('회전·홀드·하드드롭은 키보드·보조기기 누름(click, detail 0)으로도 동작하고, 터치는 한 번만', () => {
    const onInstant = vi.fn();
    render(<TouchControls onHoldStart={vi.fn()} onHoldEnd={vi.fn()} onInstant={onInstant} />);
    const [button] = screen.getAllByRole('button').slice(-1);
    // 키보드 Enter·Space → click만 (detail 0)
    fireEvent.click(button, { detail: 0 });
    expect(onInstant).toHaveBeenCalledTimes(1);
    // 터치·마우스 → pointerdown에서 한 번, 뒤따르는 click(detail 1)은 무시
    fireEvent.pointerDown(button);
    fireEvent.click(button, { detail: 1 });
    expect(onInstant).toHaveBeenCalledTimes(2);
  });

  it('하드 드롭은 회전 묶음과 떨어져 따로 있다 — 회전하려다 즉시 떨어뜨리지 않게 (D-018)', () => {
    render(<TouchControls onHoldStart={vi.fn()} onHoldEnd={vi.fn()} onInstant={vi.fn()} />);
    const rotate = screen.getByRole('group', { name: '회전' });
    expect(within(rotate).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['반시계 방향 회전', '시계 방향 회전']);
    expect(within(rotate).queryByRole('button', { name: '하드 드롭' })).toBeNull();
    expect(within(screen.getByRole('group', { name: '드롭·홀드' })).getByRole('button', { name: '하드 드롭' })).toBeInTheDocument();
  });
});
