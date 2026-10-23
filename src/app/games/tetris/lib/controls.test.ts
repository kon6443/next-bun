// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './controls';

describe('isTypingTarget (FE-23)', () => {
  it('입력창·편집 영역의 키는 게임으로 보내지 않고, 대화상자 안은 includeDialogs일 때만', () => {
    const input = document.createElement('input');
    expect(isTypingTarget(input)).toBe(true);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    expect(isTypingTarget(button)).toBe(false);
    expect(isTypingTarget(button, { includeDialogs: true })).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
