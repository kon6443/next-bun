// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

import { CampaignMap } from '../components/CampaignMap';
import { PROGRESS_KEY } from '../lib/progress';

describe('useProgress — 캠페인 진행(기기 저장) (games-polish FE-44)', () => {
  beforeEach(() => localStorage.clear());

  it('서버 렌더(하이드레이션 전)에는 "전부 잠김"을 그리지 않고 불러오는 중으로 둔다', () => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, stars: { s1: { normal: 3 } } }));
    const html = renderToString(<CampaignMap />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('🔒');
  });

  it('클라이언트에서는 저장된 진행을 바로 그리고, 다른 탭에서 깬 스테이지도 반영한다', () => {
    render(<CampaignMap />);
    expect(screen.getByRole('link', { name: /스테이지 1/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /스테이지 2/ })).toBeNull();
    act(() => {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify({ v: 1, stars: { s1: { normal: 2 } } }));
      window.dispatchEvent(new StorageEvent('storage', { key: PROGRESS_KEY }));
    });
    expect(screen.getByRole('link', { name: /스테이지 2/ })).toBeTruthy();
  });
});
