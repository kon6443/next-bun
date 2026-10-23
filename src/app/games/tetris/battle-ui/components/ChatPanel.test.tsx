// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

const msgs = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({ key: from + i, playerId: 'p2', name: '친구', text: `말 ${from + i}` }));

describe('ChatPanel', () => {
  it('최근 50개로 잘려 길이가 그대로여도 새 메시지가 오면 맨 아래로 스크롤한다', () => {
    const view = render(<ChatPanel messages={msgs(1, 50)} myPlayerId="p1" enabled onSend={vi.fn()} />);
    const list = screen.getByRole('list');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 999 });
    list.scrollTop = 0;
    view.rerender(<ChatPanel messages={msgs(2, 50)} myPlayerId="p1" enabled onSend={vi.fn()} />);
    expect(list.scrollTop).toBe(999);
  });
});
