// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameAbout } from './GameAbout';

const props = { title: '테트리스 소개', paragraphs: ['소개 문단'], features: ['특징 하나'], jsonLd: { '@type': 'VideoGame', name: '테트리스' } };

describe('GameAbout', () => {
  it('기본 — 카드 섹션 + h2 제목(디펜스 등 그대로)', () => {
    render(<GameAbout {...props} />);
    expect(screen.getByRole('heading', { level: 2, name: '테트리스 소개' })).toBeTruthy();
    expect(screen.getByTestId('game-about').tagName).toBe('SECTION');
  });

  it('collapsible(테트리스 홈) — 접힌 details, summary가 첫 자식, 글·JSON-LD는 DOM에 남는다(검색엔진)', () => {
    render(<GameAbout {...props} collapsible />);
    const details = screen.getByTestId('game-about');
    expect(details.tagName).toBe('DETAILS');
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.firstElementChild?.tagName).toBe('SUMMARY');
    expect(details.firstElementChild?.textContent).toContain('테트리스 소개');
    expect(details.textContent).toContain('소개 문단');
    expect(details.querySelector('script[type="application/ld+json"]')?.textContent).toContain('VideoGame');
  });
});
