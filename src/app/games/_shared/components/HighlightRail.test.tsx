// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { HighlightMarks, HighlightNav } from './HighlightRail';

const KINDS = { tetris: { label: '테트리스', dot: 'bg-sky-400' }, tspin: { label: 'T-스핀', dot: 'bg-fuchsia-400' } } as const;
const MARKS = [
  { at: 120, kind: 'tetris' as const, detail: '4줄' },
  { at: 600, kind: 'tspin' as const },
  { at: 900, kind: 'tetris' as const },
];
const fmt = (at: number) => `0:${String(Math.floor(at / 60)).padStart(2, '0')}`;

describe('HighlightRail (games-polish P4)', () => {
  it('막대 위 점 — 위치는 막대 끝 대비 비율, 장식이라 보조기기에서 숨긴다', () => {
    render(<HighlightMarks marks={MARKS} kinds={KINDS} max={1200} />);
    const marks = screen.getByTestId('highlight-marks');
    expect(marks.getAttribute('aria-hidden')).toBe('true');
    expect([...marks.children].map((c) => (c as HTMLElement).style.left)).toEqual(['10%', '50%', '75%']);
  });

  it('이전·다음 버튼 이름에 종류·시각, 누르면 그 순간 leadIn 앞으로 · 범례는 종류별 개수', () => {
    const onSeek = vi.fn();
    render(<HighlightNav marks={MARKS} kinds={KINDS} position={300} leadIn={60} slack={120} formatAt={fmt} onSeek={onSeek} />);
    const next = screen.getByRole('button', { name: '다음 하이라이트 — T-스핀 0:10' });
    const prev = screen.getByRole('button', { name: '이전 하이라이트 — 테트리스 4줄 0:02' });
    fireEvent.click(next);
    fireEvent.click(prev);
    expect(onSeek.mock.calls).toEqual([[540], [60]]);
    expect(screen.getByRole('list', { name: '하이라이트 종류' }).textContent).toBe('테트리스 2T-스핀 1');
  });

  it('더 없으면 그 방향 버튼은 잠긴다, 하이라이트가 없으면 아무것도 그리지 않는다', () => {
    const { rerender, container } = render(<HighlightNav marks={MARKS} kinds={KINDS} position={0} leadIn={60} slack={120} formatAt={fmt} onSeek={() => {}} />);
    expect(screen.getByRole('button', { name: '이전 하이라이트 없음' })).toBeDisabled();
    rerender(<HighlightNav marks={[]} kinds={KINDS} position={0} leadIn={60} slack={120} formatAt={fmt} onSeek={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
