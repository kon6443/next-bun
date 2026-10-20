// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TaskTagChips } from './TagChip';

const tags = [
  { tagId: 1, tagName: '버그', tagColor: '#F87171' },
  { tagId: 2, tagName: '디자인', tagColor: '#38BDF8' },
];

afterEach(cleanup);

describe('TaskTagChips', () => {
  it('onTagClick이 없으면 칩은 버튼이 아니다', () => {
    render(<TaskTagChips tags={tags} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('버그')).toBeInTheDocument();
  });

  it('칩을 누르면 그 태그로 거르고, 카드 클릭·키 입력으로 번지지 않는다', () => {
    const onTagClick = vi.fn();
    const onCardClick = vi.fn();
    const onCardKeyDown = vi.fn();
    render(
      <div onClick={onCardClick} onKeyDown={onCardKeyDown}>
        <TaskTagChips tags={tags} onTagClick={onTagClick} />
      </div>,
    );

    const chip = screen.getByRole('button', { name: '디자인 태그로 필터' });
    fireEvent.click(chip);
    fireEvent.keyDown(chip, { key: 'Enter' });

    expect(onTagClick).toHaveBeenCalledWith(2);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onCardKeyDown).not.toHaveBeenCalled();
  });

  it('최대 개수를 넘는 태그는 "+N"으로 줄이고 버튼으로 만들지 않는다', () => {
    render(<TaskTagChips tags={tags} max={1} onTagClick={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});
