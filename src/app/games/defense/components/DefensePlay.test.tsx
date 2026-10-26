// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { buildCost, createGame, findStage, TOWER_ID } from '../engine';
import DefensePlay from './DefensePlay';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

describe('DefensePlay (플레이 화면 조작)', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom은 캔버스 2D를 지원하지 않는다 — 그리기는 건너뛰고(컨텍스트 null) 조작만 본다
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 360, height: 600, top: 0, left: 0, right: 360, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('슬롯 탭 → 링 2탭으로 대포 건설 → 골드 감소·슬롯 표시 → 웨이브 시작으로 playing', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    const slot = await screen.findByTestId('defense-slot-7');
    const gold = Number(screen.getByTestId('defense-gold').dataset.value);
    expect(screen.getByTestId('defense-board').dataset.status).toBe('ready');
    fireEvent.click(slot);
    const cannon = screen.getByTestId('defense-ring-build-1');
    fireEvent.click(cannon);
    expect(screen.getByTestId('defense-slot-7').dataset.tower).toBe('');
    fireEvent.click(screen.getByTestId('defense-ring-build-1'));
    const stage = findStage('s1')!;
    expect(screen.getByTestId('defense-slot-7').dataset.tower).toBe(String(TOWER_ID.CANNON));
    expect(Number(screen.getByTestId('defense-gold').dataset.value)).toBe(gold - buildCost(createGame(stage, 1), TOWER_ID.CANNON));
    // 건설 뒤 링은 닫힌다
    expect(screen.queryByTestId('defense-ring')).toBeNull();
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
    expect(screen.getByTestId('defense-wave').dataset.value).toBe('1');
  });

  it('단축키 — 슬롯 선택 뒤 숫자 두 번이면 건설, Space로 웨이브 시작, P로 일시정지', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    fireEvent.click(await screen.findByTestId('defense-slot-5'));
    // 길게 누름(반복)은 확정하지 않는다
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(window, { key: '1', code: 'Digit1', repeat: true });
    expect(screen.getByTestId('defense-slot-5').dataset.tower).toBe('');
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    expect(screen.getByTestId('defense-slot-5').dataset.tower).toBe(String(TOWER_ID.ARCHER));
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
    // 한글 입력 상태 — e.key는 'ㅔ'지만 물리 키(P)로 판정
    fireEvent.keyDown(window, { key: 'ㅔ', code: 'KeyP' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('paused');
  });

  it('마우스로 슬롯을 눌러도 Space는 웨이브 호출 — 링 버튼에 포커스가 가지 않고 건설도 나가지 않는다', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    const slot = await screen.findByTestId('defense-slot-0');
    fireEvent.click(slot, { detail: 1 });
    expect(screen.getByTestId('defense-ring')).toBeTruthy();
    expect(document.activeElement?.getAttribute('data-testid') ?? '').not.toMatch(/^defense-ring-/);
    fireEvent.keyDown(document.activeElement ?? window, { key: ' ', code: 'Space' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
    expect(screen.getByTestId('defense-slot-0').dataset.tower).toBe('');
  });

  it('링 버튼에 포커스가 있어도 Space는 웨이브 호출(버튼은 Enter) · 키보드로 연 링은 첫 항목에 포커스', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    fireEvent.click(await screen.findByTestId('defense-slot-0'), { detail: 0 });
    const first = screen.getByTestId('defense-ring-build-0');
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: ' ', code: 'Space' });
    expect(screen.getByTestId('defense-board').dataset.status).toBe('playing');
    expect(first.dataset.armed).toBe('false');
  });

  it('Space keyup도 막는다(keyup에서 버튼을 누르는 브라우저 대비) — 글 입력 요소는 그대로', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    const slot = await screen.findByTestId('defense-slot-0');
    expect(fireEvent.keyUp(slot, { key: ' ', code: 'Space' })).toBe(false);
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(fireEvent.keyUp(input, { key: ' ', code: 'Space' })).toBe(true);
    input.remove();
  });

  it('단축키 글자는 자판에 보이는 글자(e.key) — Dvorak의 U(물리 키 KeyF)는 배속이 아니라 업그레이드', async () => {
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    fireEvent.click(await screen.findByTestId('defense-slot-5'), { detail: 1 });
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    fireEvent.click(screen.getByTestId('defense-slot-5'), { detail: 1 });
    fireEvent.keyDown(window, { key: 'u', code: 'KeyF' });
    fireEvent.keyDown(window, { key: 'u', code: 'KeyF' });
    expect(screen.getByTestId('defense-slot-5').dataset.level).toBe('2');
    expect(screen.getByTestId('defense-speed').dataset.value).toBe('1');
  });

  it('잠긴 스테이지(진행 없음 + S2)는 플레이 대신 안내', async () => {
    render(<DefensePlay boardKey="s2" seed={1} fixedSeed />);
    expect(await screen.findByText('아직 열리지 않은 스테이지·난이도예요.')).toBeTruthy();
    expect(screen.queryByTestId('defense-board')).toBeNull();
  });

  it('멈춘 동안(대기·일시정지)은 같은 그림을 다시 그리지 않고, 명령(건설)·진행이 있으면 그린다 (games-polish FE-40)', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    // 아무 메서드나 받아 호출 수만 센다 — 그라데이션·measureText 등은 자기 자신을 돌려준다
    let calls = 0;
    const store: Record<string | symbol, unknown> = {};
    const ctx: unknown = new Proxy(store, {
      get: (target, key) => {
        if (key in target) return target[key];
        const method = () => {
          calls++;
          return ctx;
        };
        target[key] = method;
        return method;
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(ctx as CanvasRenderingContext2D);
    render(<DefensePlay boardKey="s1" seed={1} fixedSeed />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const frames = async (ms: number) => {
      const before = calls;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
      return calls - before;
    };
    expect(await frames(500)).toBe(0); // 대기 — 첫 그림 뒤로는 그대로
    act(() => {
      fireEvent.click(screen.getByTestId('defense-slot-7'));
    });
    expect(await frames(50)).toBeGreaterThan(0); // 선택 고리
    expect(await frames(500)).toBe(0);
    act(() => {
      fireEvent.click(screen.getByTestId('defense-call-wave'));
    });
    const playing = await frames(500);
    expect(playing).toBeGreaterThan(0); // 진행 중에는 매 프레임
    vi.useRealTimers();
  });

  it('보드를 해석할 수 없으면 빈 화면이 아니라 안내와 돌아갈 링크 (FE-45)', () => {
    render(<DefensePlay boardKey="zz" seed={1} fixedSeed />);
    expect(screen.getByText('스테이지를 찾지 못했어요.')).toBeTruthy();
    expect(screen.getByRole('link', { name: '디펜스 처음으로' }).getAttribute('href')).toBe('/games/defense');
  });
});
