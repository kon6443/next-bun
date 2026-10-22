import { describe, it, expect } from 'vitest';
import { TUTORIAL_BUBBLE_BAND, tutorialBubbleAbove } from './tutorial';

describe('tutorialBubbleAbove — 말풍선은 가리키는 곳·슬롯을 덮지 않는 쪽', () => {
  const H = 700;
  it('아래쪽 슬롯을 가리켜도 위 띠에 슬롯이 있고 아래 띠가 비었으면 아래(S1 0단계: 0번 슬롯을 덮던 회귀)', () => {
    expect(tutorialBubbleAbove(H, [60, 100, 500, 560], 22, { top: 532, bottom: 588 }, true)).toBe(false);
  });
  it('가리키는 곳은 슬롯 수와 상관없이 덮지 않는다', () => {
    expect(tutorialBubbleAbove(H, [30, 40, 50], 22, { top: H - 48, bottom: H }, false)).toBe(true);
  });
  it('양쪽이 같으면 선호하는 쪽', () => {
    expect(tutorialBubbleAbove(H, [350], 22, null, true)).toBe(true);
    expect(tutorialBubbleAbove(H, [350], 22, null, false)).toBe(false);
  });
  it('띠 경계에 걸친 슬롯도 덮는 것으로 센다', () => {
    expect(tutorialBubbleAbove(H, [TUTORIAL_BUBBLE_BAND + 10], 22, null, true)).toBe(false);
  });
});
