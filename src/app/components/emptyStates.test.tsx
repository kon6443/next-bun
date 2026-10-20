// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Link from 'next/link';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
// jsdom에는 ResizeObserver가 없다 — 칸반이 컬럼 폭 측정에 쓴다
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { Kanban } from './Kanban';
import { ListView } from './ListView';
import { GanttChart } from './GanttChart';

const action = <Link href="/teams/1/tasks/new">새 카드 작성</Link>;
const emptyColumns = { todo: [], inProgress: [], done: [], onHold: [], cancelled: [] };

afterEach(cleanup);

describe('보드 빈 상태의 행동 버튼', () => {
  it('칸반은 첫 컬럼(할 일)이 비었을 때만 행동을 띄운다 — 다른 빈 컬럼에는 없다', () => {
    render(<Kanban tasksByColumn={emptyColumns} onStatusChange={async () => {}} teamId="1" emptyAction={action} />);
    expect(screen.getAllByText('태스크가 없습니다').length).toBeGreaterThan(1);
    expect(screen.getAllByRole('link', { name: '새 카드 작성' })).toHaveLength(1);
  });

  it('리스트·간트 빈 목록에 "새 카드 작성"을 띄운다', () => {
    render(
      <>
        <ListView tasks={[]} teamId="1" emptyAction={action} />
        <GanttChart tasks={[]} teamId="1" emptyAction={action} />
      </>,
    );
    expect(screen.getAllByRole('link', { name: '새 카드 작성' })).toHaveLength(2);
  });

  it('리스트·간트의 빈 안내는 가로 스크롤 영역 밖에 둔다 — 모바일에서 화면 밖 가운데로 밀리지 않게', () => {
    render(
      <>
        <ListView tasks={[]} teamId="1" emptyAction={action} />
        <GanttChart tasks={[]} teamId="1" emptyAction={action} />
      </>,
    );
    for (const link of screen.getAllByRole('link', { name: '새 카드 작성' })) {
      expect(link.closest('.overflow-x-auto')).toBeNull();
      expect(link.closest('table')).toBeNull();
    }
  });

  it('행동을 주지 않으면(보관함 탭) 버튼 없이 문구만 보인다', () => {
    render(<ListView tasks={[]} teamId="1" />);
    expect(screen.queryByRole('link', { name: '새 카드 작성' })).toBeNull();
    expect(screen.getByText('표시할 태스크가 없습니다')).toBeInTheDocument();
  });
});
