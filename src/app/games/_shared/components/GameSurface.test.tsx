// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { GameSurface } from './GameSurface';

const contextMenuPrevented = (el: Element) => {
  const event = createEvent.contextMenu(el);
  fireEvent(el, event);
  return event.defaultPrevented;
};

describe('GameSurface — 꾹 눌러도 선택·복사 메뉴가 뜨지 않는 게임 표면 (games-polish P9)', () => {
  it('판·캔버스·버튼에서는 길게 누르기 메뉴(contextmenu)를 막고, 입력칸·선택 허용 글에서는 그대로 둔다', () => {
    render(
      <GameSurface>
        <p data-testid="text">점수 1,200</p>
        <canvas data-testid="board" />
        <button type="button">회전</button>
        <input aria-label="채팅" />
        <textarea aria-label="메모" />
        <p className="select-all" data-testid="link">
          https://example.test/r/1
        </p>
      </GameSurface>,
    );
    expect(contextMenuPrevented(screen.getByTestId('text'))).toBe(true);
    expect(contextMenuPrevented(screen.getByTestId('board'))).toBe(true);
    expect(contextMenuPrevented(screen.getByRole('button', { name: '회전' }))).toBe(true);
    expect(contextMenuPrevented(screen.getByRole('textbox', { name: '채팅' }))).toBe(false);
    expect(contextMenuPrevented(screen.getByRole('textbox', { name: '메모' }))).toBe(false);
    expect(contextMenuPrevented(screen.getByTestId('link'))).toBe(false);
  });

  it('채팅·이름 입력은 그대로 된다', () => {
    render(
      <GameSurface>
        <input aria-label="이름" defaultValue="" />
      </GameSurface>,
    );
    const input = screen.getByRole('textbox', { name: '이름' }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '테트' } });
    expect(input.value).toBe('테트');
    expect(input.closest('[data-game-surface]')).not.toBeNull();
  });

  it('globals.css가 표면에서 선택·콜아웃·탭 하이라이트를 끄고, 입력칸·선택 허용 글은 되돌린다', () => {
    const css = readFileSync(resolve(__dirname, '../../../globals.css'), 'utf8');
    const block = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      expect(start, selector).toBeGreaterThanOrEqual(0);
      return css.slice(start, css.indexOf('}', start));
    };
    const surface = block('[data-game-surface]');
    for (const rule of ['user-select: none', '-webkit-user-select: none', '-webkit-touch-callout: none', '-webkit-tap-highlight-color: transparent']) expect(surface).toContain(rule);
    const editable = block('[data-game-surface] :is(input, textarea, select, [contenteditable="true"])');
    for (const rule of ['user-select: text', '-webkit-user-select: text', '-webkit-touch-callout: default']) expect(editable).toContain(rule);
    expect(block('[data-game-surface] :is(.select-all, .select-text)')).toContain('-webkit-touch-callout: default');
    expect(block('[data-game-surface] :is(img, canvas, a)')).toContain('-webkit-user-drag: none');
  });
});
