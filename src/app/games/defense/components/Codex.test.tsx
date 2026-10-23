// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ENGINE_VERSION } from '../engine/constants';
import { defenseStorage } from '../lib/defenseGame';
import { saveResume } from '../lib/resume';
import { Codex } from './Codex';
import { HubActions } from './HubActions';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
const submitGameScore = vi.hoisted(() => vi.fn());
vi.mock('@/services/gameService', () => ({ submitGameScore }));
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

  it('허브 — 무한·주간 저장본은 그 모드 입구로, 보드 표기와 함께', async () => {
    saveResume({ engineVersion: ENGINE_VERSION, mode: 'weekly', boardKey: 'weekly-2026-w43', seed: 1, tick: 10, inputs: [], savedAt: 1, sessionId: 's', sessionReceivedAt: 1 });
    render(<HubActions />);
    const card = await screen.findByTestId('defense-hub-resume');
    expect(card.getAttribute('href')).toBe('/games/defense/play/weekly');
    expect(card.textContent).toContain('W43 주간 도전');
  });

  it('허브 — 등록하지 못한 기록을 다시 등록하면 보관을 지우고 순위를 알린다', async () => {
    const replay = { engineVersion: ENGINE_VERSION, frames: 100, inputs: [0, 0] };
    defenseStorage.savePendingSubmission({ sessionId: 'sess', playerName: '수비왕', replay, score: 3_000_000, savedAt: 1 });
    submitGameScore.mockResolvedValue({ code: 'SUCCESS', message: '', data: { scoreId: 7, score: 3_000_000, detail: {}, ranks: { daily: 4, weekly: 4, all: 4 } } });
    render(<HubActions />);
    await act(async () => {
      fireEvent.click(await screen.findByTestId('defense-pending-retry'));
    });
    expect(submitGameScore).toHaveBeenCalledWith('defense', { sessionId: 'sess', playerName: '수비왕', replay }, undefined);
    expect(defenseStorage.loadPendingSubmissions()).toEqual([]);
    expect(screen.getByTestId('defense-pending').textContent).toContain('4위');
  });
});
