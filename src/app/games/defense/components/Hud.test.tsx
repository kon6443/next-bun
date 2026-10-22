// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { HudSnapshot } from '../hooks/useDefensePlay';
import { Hud } from './Hud';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const hud = { status: 'playing', speed: 3, tick: 0, lives: 20, gold: 9999, wavesStarted: 12, wavesCleared: 11, totalWaves: 12, countdown: 0, earlyBonus: 0, canCall: false } as HudSnapshot;

describe('Hud — 좁은 폭(320px)에서도 한 줄', () => {
  // jsdom은 배치를 계산하지 않는다 — 실제 폭 판정은 브라우저 스크린샷(320·390px). 여기서는 줄이 꺾일 자리가 없다는 것만 고정한다
  it('수치 칸은 공백 없는 짧은 표기(W12/12)이고 머리줄은 줄바꿈 금지 — 이름은 보조기술에 남긴다', () => {
    const noop = () => {};
    render(<Hud hud={hud} exitHref="/x" soundOn={false} onToggleSound={noop} onTogglePause={noop} onCycleSpeed={noop} />);
    const wave = screen.getByTestId('defense-wave');
    expect(wave.textContent).toBe('W12/12');
    for (const id of ['defense-lives', 'defense-gold', 'defense-wave']) expect(screen.getByTestId(id).textContent).not.toMatch(/\s/);
    expect(wave.querySelector('dt')?.getAttribute('aria-label')).toBe('웨이브');
    expect(wave.closest('header')?.className).toContain('whitespace-nowrap');
  });
});
