// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ENGINE_VERSION } from '../engine/constants';
import { saveResume } from '../lib/resume';
import { Codex } from './Codex';
import { HubActions } from './HubActions';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

describe('도감·허브 보조 동작', () => {
  beforeEach(() => localStorage.clear());

  it('도감 — 열린 스테이지의 타워·만난 적만 이름이 보이고, 브리핑은 열린 스테이지 것만', async () => {
    localStorage.setItem('defense:progress', JSON.stringify({ v: 1, stars: { s1: { normal: 2 } }, metEnemies: [0, 1] }));
    render(<Codex />);
    expect((await screen.findByTestId('defense-codex-tower-2')).dataset.known).toBe('true'); // s2(열림)의 마법탑
    expect(screen.getByTestId('defense-codex-tower-3').dataset.known).toBe('false');
    expect(screen.getByTestId('defense-codex-enemy-1').dataset.known).toBe('true');
    expect(screen.getByTestId('defense-codex-enemy-2').dataset.known).toBe('false');
    expect(screen.getByText(/새 적: 방패병/)).toBeTruthy();
    expect(screen.queryByText(/서리탑 · 새 적/)).toBeNull();
  });

  it('허브 — 같은 엔진 버전의 이어하기 저장본이 있으면 카드(그 보드 플레이 경로), 없으면 없다', async () => {
    const { unmount } = render(<HubActions />);
    expect(screen.queryByTestId('defense-hub-resume')).toBeNull();
    unmount();
    saveResume({ engineVersion: ENGINE_VERSION, boardKey: 's1-hard', seed: 1, tick: 10, inputs: [], savedAt: 1 });
    render(<HubActions />);
    expect((await screen.findByTestId('defense-hub-resume')).getAttribute('href')).toBe('/games/defense/play/stage/s1-hard');
  });
});
