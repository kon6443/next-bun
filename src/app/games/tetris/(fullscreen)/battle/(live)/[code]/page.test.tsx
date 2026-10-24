// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render } from '@testing-library/react';

const mounts: string[] = [];
// 입장 상태를 가진 화면 대역 — 마운트될 때만 기록한다
vi.mock('../../../../battle-ui/components/BattleRoom', () => ({
  BattleRoom: ({ code }: { code: string }) => {
    useState(() => mounts.push(code));
    return <p>{code}</p>;
  },
}));

import TetrisBattleRoomPage from './page';

const pageFor = (code: string) => TetrisBattleRoomPage({ params: Promise.resolve({ code }), searchParams: Promise.resolve({}) });

describe('대전 방 페이지 (games-polish FE-35)', () => {
  it('다른 방으로 바로 이동하면 방 화면을 새로 마운트한다 — 앞 방의 입장 상태가 이어지지 않게', async () => {
    const view = render(await pageFor('abc234'));
    view.rerender(await pageFor('xyz789'));
    expect(mounts).toEqual(['ABC234', 'XYZ789']);
  });
});
