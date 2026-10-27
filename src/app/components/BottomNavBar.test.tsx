// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ value: '/teams' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

import BottomNavBar from './BottomNavBar';

const VIEW = 667;
const DOC = 3000;

/** 창 스크롤을 흉내 낸다 — scrollY를 바꾸고 scroll 이벤트 뒤 한 프레임 */
async function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  await act(async () => {
    window.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

const nav = () => screen.getByRole('navigation', { name: '주요 탐색' });

/** :focus-visible 판정 대역 — 키보드(true)·마우스·터치(false). 되돌리는 함수를 돌려준다 */
function focusVisible(value: boolean): () => void {
  const original = Element.prototype.matches;
  const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
    return selector === ':focus-visible' ? value : original.call(this, selector);
  });
  return () => spy.mockRestore();
}

/** performance.now 대역 — 경로·크기 바뀜 뒤 300ms 동안은 스크롤을 세지 않으니 시간을 넘겨 준다 */
const clock = { now: 0 };
const pass = (ms: number) => {
  clock.now += ms;
};

beforeEach(() => {
  clock.now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now);
  pathname.value = '/teams';
  Object.defineProperty(window, 'innerHeight', { value: VIEW, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: DOC, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('하단 내비 자동 숨김 (ui-bnb-autohide)', () => {
  it('아래로 내리면 숨고, 조금 올리면 보인다 — 숨김은 transform 클래스(data-hidden)', async () => {
    render(<BottomNavBar />);
    pass(1000);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
    await scrollTo(100);
    await scrollTo(200);
    expect(nav().hasAttribute('data-hidden')).toBe(true);
    await scrollTo(195);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
  });

  it('내비 안에 포커스가 있으면 숨지 않는다 — 나가면 다시 스크롤 상태를 따른다', async () => {
    render(<BottomNavBar />);
    pass(1000);
    await scrollTo(100);
    const link = screen.getByRole('link', { name: /팀스페이스/ });
    // 키보드 포커스 — jsdom은 :focus-visible을 판정하지 않으니 키보드로 온 것으로 둔다
    const restore = focusVisible(true);
    act(() => link.focus());
    restore();
    await scrollTo(300);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
    fireEvent.blur(link, { relatedTarget: document.body });
    expect(nav().hasAttribute('data-hidden')).toBe(true);
  });

  it('경로가 바뀌면 다시 보인다', async () => {
    const { rerender } = render(<BottomNavBar />);
    pass(1000);
    await scrollTo(100);
    await scrollTo(300);
    expect(nav().hasAttribute('data-hidden')).toBe(true);
    pathname.value = '/mypage';
    rerender(<BottomNavBar />);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
    // 경로 직후의 점프(뒤로 가기 스크롤 복원)는 세지 않는다
    await scrollTo(1200);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
  });

  it('창 크기가 바뀐 직후의 스크롤(키보드가 입력칸을 밀어 올림)로는 숨지 않는다', async () => {
    render(<BottomNavBar />);
    pass(1000);
    await scrollTo(100);
    await scrollTo(95); // 보이는 상태에서
    expect(nav().hasAttribute('data-hidden')).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await scrollTo(400);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
    // 300ms 뒤에는 다시 센다
    pass(400);
    await scrollTo(500);
    expect(nav().hasAttribute('data-hidden')).toBe(true);
  });

  it('마우스·터치로 누른 링크 포커스(:focus-visible 아님)는 숨김을 막지 않는다 — Chrome은 누른 링크에 포커스를 남긴다', async () => {
    render(<BottomNavBar />);
    pass(1000);
    const link = screen.getByRole('link', { name: /팀스페이스/ });
    const restore = focusVisible(false);
    act(() => link.focus());
    restore();
    await scrollTo(100);
    await scrollTo(300);
    expect(nav().hasAttribute('data-hidden')).toBe(true);
  });

  it('경로가 바뀌면 지금 포커스로 다시 센다 — 마우스로 누른 링크 포커스는 숨김을 막지 않는다', async () => {
    const { rerender } = render(<BottomNavBar />);
    pass(1000);
    const restore = focusVisible(false);
    act(() => screen.getByRole('link', { name: /팀스페이스/ }).focus());
    pathname.value = '/mypage';
    rerender(<BottomNavBar />);
    restore();
    pass(1000);
    await scrollTo(100);
    await scrollTo(300);
    expect(nav().hasAttribute('data-hidden')).toBe(true);
  });

  it('키보드로 이동해 링크에 남은 포커스는 경로가 바뀌어도 살린다 — 포커스가 든 내비가 화면 밖으로 숨지 않게', async () => {
    const { rerender } = render(<BottomNavBar />);
    pass(1000);
    const restore = focusVisible(true);
    act(() => screen.getByRole('link', { name: /팀스페이스/ }).focus());
    pathname.value = '/mypage';
    rerender(<BottomNavBar />);
    restore();
    pass(1000);
    await scrollTo(100);
    await scrollTo(300);
    expect(nav().hasAttribute('data-hidden')).toBe(false);
  });

  it('전체화면 게임에서는 지금처럼 그리지 않는다', () => {
    pathname.value = '/games/tetris/play';
    render(<BottomNavBar />);
    pass(1000);
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('키보드로 들어온 뒤 마우스로 다른 내비 링크를 눌러 이동하면 다시 숨는다 — 경로가 바뀔 때 지금 포커스로 다시 센다', async () => {
    const { rerender } = render(<BottomNavBar />);
    pass(1000);
    let restore = focusVisible(true);
    act(() => screen.getByRole('link', { name: /팀스페이스/ }).focus());
    restore();
    // 마우스로 다른 링크 — blur의 relatedTarget이 내비 안이라 포커스 표시는 그대로 남는다
    restore = focusVisible(false);
    act(() => screen.getByRole('link', { name: /마이페이지/ }).focus());
    pathname.value = '/mypage';
    rerender(<BottomNavBar />);
    restore();
    pass(1000);
    await scrollTo(100);
    await scrollTo(300);
    expect(nav().hasAttribute('data-hidden')).toBe(true);
  });
});

