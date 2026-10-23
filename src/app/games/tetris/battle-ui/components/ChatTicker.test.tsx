// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { CHAT_TICKER_SHOW_MS, ChatTicker } from './ChatTicker';

const msg = (key: number, text: string) => ({ key, playerId: 'p2', name: '친구', text, at: 'x' });

describe('ChatTicker (D-016 생존자 자막)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('마운트 전에 받은 대화는 띄우지 않고, 새로 온 것만 최근 두 줄을 잠깐 띄운다', () => {
    const view = render(<ChatTicker messages={[msg(1, '대기실 대화')]} />);
    expect(screen.queryByText('대기실 대화')).toBeNull();
    // 알림 영역은 처음부터 있다 — 내용과 함께 생기면 스크린리더가 첫 줄을 읽지 않는다
    expect(screen.getByRole('list', { name: '채팅' })).toHaveAttribute('aria-live', 'polite');
    view.rerender(<ChatTicker messages={[msg(1, '대기실 대화'), msg(2, '하나'), msg(3, '둘'), msg(4, '셋')]} />);
    expect(screen.queryByText('하나')).toBeNull();
    expect(screen.getByText('둘')).toBeInTheDocument();
    expect(screen.getByText('셋')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(CHAT_TICKER_SHOW_MS);
    });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
