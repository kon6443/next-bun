// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useBoardFocus } from './useBoardFocus';

function Boards({ enabled }: { enabled: boolean }) {
  const focus = useBoardFocus(enabled);
  return (
    <>
      {focus.focusedId && (
        <button ref={focus.backRef} type="button" onClick={focus.close}>
          돌아가기
        </button>
      )}
      <p data-testid="focused">{focus.focusedId ?? '없음'}</p>
      {['a', 'b'].map((id) => (
        <div key={id} data-testid={`board-${id}`} {...focus.boardProps(id, id.toUpperCase())}>
          {id}
        </div>
      ))}
    </>
  );
}

describe('useBoardFocus (FE-28)', () => {
  it('판은 버튼 역할 — Enter·Space로 열고, 돌아가기 버튼에 포커스, Esc로 닫으면 그 판에 포커스가 돌아온다', () => {
    render(<Boards enabled />);
    const boardA = screen.getByRole('button', { name: 'A 화면 크게 보기' });
    boardA.focus();
    fireEvent.keyDown(boardA, { key: 'Enter' });
    expect(screen.getByTestId('focused')).toHaveTextContent('a');
    expect(screen.getByRole('button', { name: '돌아가기' })).toHaveFocus();
    // 크게 보는 판은 더 누를 게 없다
    expect(screen.queryByRole('button', { name: 'A 화면 크게 보기' })).toBeNull();
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(screen.getByTestId('focused')).toHaveTextContent('없음');
    expect(screen.getByRole('button', { name: 'A 화면 크게 보기' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('button', { name: 'B 화면 크게 보기' }), { key: ' ' });
    expect(screen.getByTestId('focused')).toHaveTextContent('b');
    fireEvent.click(screen.getByRole('button', { name: '돌아가기' }));
    expect(screen.getByRole('button', { name: 'B 화면 크게 보기' })).toHaveFocus();
  });

  it('입력창(관전 채팅)에서 누른 Esc는 크게 보기를 닫지 않는다', () => {
    render(
      <>
        <Boards enabled />
        <input aria-label="채팅 입력" />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A 화면 크게 보기' }));
    fireEvent.keyDown(screen.getByLabelText('채팅 입력'), { key: 'Escape' });
    expect(screen.getByTestId('focused')).toHaveTextContent('a');
  });

  it('꺼져 있으면 판은 버튼이 아니고, 크게 보는 중에 꺼지면 원래 배치로', () => {
    const view = render(<Boards enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'A 화면 크게 보기' }));
    view.rerender(<Boards enabled={false} />);
    expect(screen.getByTestId('focused')).toHaveTextContent('없음');
    expect(screen.queryByRole('button', { name: /크게 보기/ })).toBeNull();
  });
});
