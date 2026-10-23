// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { createGame, findStage } from '../engine';
import { type RingOption, ringOptions, tapRing } from '../lib/ringOptions';
import { tutorialBubbleAbove } from '../lib/tutorial';
import { TowerRing, ringSpan } from './TowerRing';

const stage = findStage('s1')!;

/** DefensePlay와 같은 연결 — armed는 부모, 판정은 tapRing */
function Harness({ options, onCommand, focusOnOpen = false }: { options: RingOption[]; onCommand: (o: RingOption) => void; focusOnOpen?: boolean }) {
  const [armed, setArmed] = useState<string | null>(null);
  return (
    <TowerRing
      options={options}
      anchor={{ x: 20, y: 20 }}
      bounds={{ width: 360, height: 600 }}
      armed={armed}
      focusOnOpen={focusOnOpen}
      onTap={(option) => {
        const next = tapRing(armed, option);
        setArmed(next.armed);
        if (next.command) onCommand(next.command);
      }}
    />
  );
}

describe('TowerRing (링 메뉴 2탭)', () => {
  it('첫 탭은 미리보기(설명 카드), 같은 버튼 다시 탭에 명령 한 번 — 다른 버튼으로 옮기면 미리보기만 이동', () => {
    const onCommand = vi.fn();
    render(<Harness options={ringOptions(createGame(stage, 1), stage, 0)} onCommand={onCommand} />);
    fireEvent.click(screen.getByTestId('defense-ring-build-0'));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByTestId('defense-ring-build-0').dataset.armed).toBe('true');
    expect(screen.getByTestId('defense-ring-detail').textContent).toContain('한 번 더 누르면 확정');
    fireEvent.click(screen.getByTestId('defense-ring-build-1'));
    expect(onCommand).not.toHaveBeenCalled();
    expect(screen.getByTestId('defense-ring-build-0').dataset.armed).toBe('false');
    fireEvent.click(screen.getByTestId('defense-ring-build-1'));
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.calls[0][0].id).toBe('build-1');
    expect(screen.queryByTestId('defense-ring-detail')).toBeNull();
  });

  it('골드가 모자란 항목은 비활성 — 눌러도 명령이 나가지 않는다', () => {
    const state = createGame(stage, 1);
    state.gold = 0;
    const onCommand = vi.fn();
    render(<Harness options={ringOptions(state, stage, 0)} onCommand={onCommand} />);
    const button = screen.getByTestId('defense-ring-build-0') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('키보드로 열면 첫 활성 항목으로 포커스, 마우스·터치로 열면 포커스를 옮기지 않는다', () => {
    const options = ringOptions(createGame(stage, 1), stage, 0);
    const { unmount } = render(<Harness options={options} onCommand={() => {}} focusOnOpen />);
    expect(document.activeElement).toBe(screen.getByTestId('defense-ring-build-0'));
    unmount();
    render(<Harness options={options} onCommand={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('버튼은 44px 이상이고 링이 컨테이너 밖으로 나가지 않는다(가장자리 슬롯)', () => {
    render(<Harness options={ringOptions(createGame(stage, 1), stage, 0)} onCommand={() => {}} />);
    for (const id of ['defense-ring-build-0', 'defense-ring-build-1']) {
      const style = (screen.getByTestId(id) as HTMLElement).style;
      expect(parseFloat(style.width)).toBeGreaterThanOrEqual(44);
      expect(parseFloat(style.left)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(style.top)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('ringSpan — 링과 설명 카드 자리 (튜토리얼 1단계 말풍선이 피한다)', () => {
  it('위쪽 링은 카드가 아래로, 아래쪽 링은 카드가 위로 — 말풍선은 그 범위를 덮지 않는 띠로', () => {
    const H = 600;
    const upper = ringSpan(150, H);
    expect(upper).toEqual({ top: 54, bottom: 318 });
    expect(tutorialBubbleAbove(H, [], 22, upper, true)).toBe(false);
    const lower = ringSpan(450, H);
    expect(lower).toEqual({ top: 282, bottom: 546 });
    expect(tutorialBubbleAbove(H, [], 22, lower, false)).toBe(true);
    // 가장자리 링은 화면 안으로 당긴 중심 기준
    expect(ringSpan(0, H).top).toBe(0);
  });
});
