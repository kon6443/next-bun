// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EmoteBar, resetEmoteCooldownForTest } from './EmoteBar';
import { EmoteBubble } from './EmoteBubble';

describe('이모트 (FE-15·FE-16)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEmoteCooldownForTest();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('보내고 줄이 닫혔다 다시 열려도 쿨다운이 이어지고, 시간이 지나면 다시 보낼 수 있다', () => {
    const onSend = vi.fn();
    const first = render(<EmoteBar onSend={onSend} compact />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onSend).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<EmoteBar onSend={onSend} compact />);
    const button = screen.getAllByRole('button')[0];
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onSend).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getAllByRole('button')[0]).not.toBeDisabled();
  });

  it('말풍선은 마운트 때 이미 있던 이모트를 다시 띄우지 않고, 새로 받은 것만 띄운다', () => {
    const view = render(<EmoteBubble emote={{ emoteId: 'gg', key: 1 }} />);
    expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<EmoteBubble emote={{ emoteId: 'gg', key: 2 }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
