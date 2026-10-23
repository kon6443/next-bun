// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import type { ShareContent } from '@/app/games/_shared/lib/shareSpec';
import { ENGINE_VERSION, OP, step } from '../engine';
import { GameDriver } from '../engine-dev/driver';
import { DefenseServerReplay } from './DefenseServerReplay';

const loadReplay = vi.hoisted(() => vi.fn());
vi.mock('@/app/games/_shared/lib/replayLoader', () => ({ loadReplay }));
const shared = vi.hoisted(() => ({ content: null as ShareContent | null }));
vi.mock('@/app/games/_shared/components/ShareMenu', () => ({
  ShareMenu: ({ content }: { content: ShareContent }) => {
    shared.content = content;
    return <div data-testid="share-menu" />;
  },
}));
vi.mock('@/app/games/_shared/hooks/useKakaoReady', () => ({ useKakaoReady: () => ({ kakaoReady: false, kakaoScript: null }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

class FakeResizeObserver {
  observe() {}
  disconnect() {}
}

describe('서버 기록 재생 화면 — 공유', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('머리줄 공유 — 기록의 보드를 제목에 싣는다(미리보기 메타와 같은 문구)', async () => {
    const driver = GameDriver.fromBoard('endless', 'endless-s1', 5);
    driver.must(OP.CALL_WAVE);
    while (!driver.state.over) {
      if (driver.state.countdown > 0) driver.command(OP.CALL_WAVE);
      step(driver.state);
    }
    const input = driver.toReplayInput();
    loadReplay.mockResolvedValue({ rank: 1, scoreId: 46, playerName: '수비왕', boardKey: 'endless-s1', score: 1_000_000, detail: { wave: 1, kills: 30, livesLeft: 0 }, durationMs: 1, createdAt: 'x', engineVersion: ENGINE_VERSION, seed: input.seed, frames: input.ticks, inputs: input.inputs, params: {} });
    render(<DefenseServerReplay scoreId={46} />);
    fireEvent.click(await screen.findByTestId('defense-share', {}, { timeout: 8000 }));
    expect(screen.getByTestId('share-menu')).toBeTruthy();
    expect(shared.content!.title).toBe('수비왕님의 타워 디펜스(무한 시즌 1) 웨이브 1 · 진척 0%');
    expect(shared.content!.url).toMatch(/\/games\/defense\/replays\/46$/);
  }, 30_000);
});
