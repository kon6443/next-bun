// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsSheet } from './SettingsSheet';

describe('공통 설정 시트 (D-001)', () => {
  it('body로 포털된 이름 있는 대화상자 — 제목·테스트 id·내용', () => {
    const { container } = render(
      <div>
        <SettingsSheet title="설정" testId="sheet" onClose={() => {}}>
          <p>내용</p>
        </SettingsSheet>
      </div>,
    );
    const dialog = screen.getByRole('dialog', { name: '설정' });
    expect(dialog.getAttribute('data-testid')).toBe('sheet');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('내용')).toBeTruthy();
    // 버튼이 놓인 자리 밖(body 바로 아래)
    expect(container.contains(dialog)).toBe(false);
  });

  it('닫기 버튼·Esc로 닫는다', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet title="설정" onClose={onClose}>
        <button type="button">안</button>
      </SettingsSheet>,
    );
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('배경은 배경에서 누르기 시작했을 때만 닫는다 — 안에서 끌다 배경에서 놓으면 닫지 않는다', () => {
    const onClose = vi.fn();
    render(
      <SettingsSheet title="설정" onClose={onClose}>
        <input aria-label="음량" type="range" />
      </SettingsSheet>,
    );
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.pointerDown(screen.getByLabelText('음량'));
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('제목 줄 왼쪽 자리(목록으로 돌아가기 등)', () => {
    render(
      <SettingsSheet title="소리" onClose={() => {}} headerStart={<button type="button">뒤로</button>}>
        x
      </SettingsSheet>,
    );
    expect(screen.getByRole('button', { name: '뒤로' })).toBeTruthy();
  });
});
