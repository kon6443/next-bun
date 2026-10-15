// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { useDialog } from './useDialog';

function Dialog({ isOpen, onClose, closeOnEscape }: { isOpen: boolean; onClose: () => void; closeOnEscape?: boolean }) {
  const ref = useDialog(isOpen, onClose, { closeOnEscape });
  if (!isOpen) return null;
  return (
    <div ref={ref} role="dialog" tabIndex={-1}>
      <button>첫 버튼</button>
      <button>마지막 버튼</button>
    </div>
  );
}

function Harness({ isOpen, onClose, closeOnEscape }: { isOpen: boolean; onClose: () => void; closeOnEscape?: boolean }) {
  return (
    <>
      <button>바깥 버튼</button>
      <Dialog isOpen={isOpen} onClose={onClose} closeOnEscape={closeOnEscape} />
    </>
  );
}

afterEach(cleanup);

describe('useDialog', () => {
  it('열리면 대화상자 안 첫 요소로 포커스를 옮긴다', () => {
    const { getByText } = render(<Harness isOpen onClose={() => {}} />);
    expect(document.activeElement).toBe(getByText('첫 버튼'));
  });

  it('Esc로 닫는다', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeOnEscape=false면 Esc로 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<Harness isOpen onClose={onClose} closeOnEscape={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('마지막 요소에서 Tab을 누르면 첫 요소로 돌아간다', () => {
    const { getByText } = render(<Harness isOpen onClose={() => {}} />);
    getByText('마지막 버튼').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('첫 버튼'));
  });

  it('닫히면 열기 전 포커스로 돌려준다', () => {
    const { getByText, rerender } = render(<Harness isOpen={false} onClose={() => {}} />);
    getByText('바깥 버튼').focus();
    rerender(<Harness isOpen onClose={() => {}} />);
    expect(document.activeElement).toBe(getByText('첫 버튼'));
    rerender(<Harness isOpen={false} onClose={() => {}} />);
    expect(document.activeElement).toBe(getByText('바깥 버튼'));
  });

  it('포커스가 대화상자 밖으로 빠진 상태에서 Tab을 누르면 안으로 되돌린다', () => {
    const { getByText } = render(<Harness isOpen onClose={() => {}} />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(getByText('첫 버튼'));
  });
});
