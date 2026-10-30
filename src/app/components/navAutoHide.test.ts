import { describe, expect, it } from 'vitest';
import { HIDE_THRESHOLD, MIN_SCROLL_RANGE, createNavAutoHide } from './navAutoHide';

const VIEW = 667;
const DOC = 3000;
const at = (y: number) => ({ y, viewport: VIEW, document: DOC });

describe('하단 내비 자동 숨김 판정 (ui-bnb-autohide)', () => {
  it('아래로 문턱만큼 이어서 내리면 숨고, 문턱 전에는 보인다', () => {
    const auto = createNavAutoHide();
    auto.update(at(100));
    expect(auto.update(at(100 + HIDE_THRESHOLD - 1))).toBe(false);
    expect(auto.update(at(100 + HIDE_THRESHOLD))).toBe(true);
  });

  it('조금만 위로 올려도(2px) 다시 보인다', () => {
    const auto = createNavAutoHide();
    auto.update(at(100));
    auto.update(at(200));
    expect(auto.hidden).toBe(true);
    expect(auto.update(at(199))).toBe(true); // 1px는 흔들림
    expect(auto.update(at(198))).toBe(false);
  });

  it('방향이 바뀌면 거리를 다시 센다 — 아래·위로 흔들리는 스크롤로는 숨지 않는다', () => {
    const auto = createNavAutoHide();
    auto.update(at(100));
    for (let i = 0; i < 10; i++) {
      auto.update(at(106));
      auto.update(at(104));
    }
    expect(auto.hidden).toBe(false);
  });

  it('맨 위(iOS 바운스 음수 포함)·맨 아래(넘친 것 포함)에서는 늘 보인다', () => {
    const auto = createNavAutoHide();
    auto.update(at(100));
    auto.update(at(300));
    expect(auto.hidden).toBe(true);
    expect(auto.update(at(-40))).toBe(false);
    auto.update(at(100));
    auto.update(at(300));
    expect(auto.update(at(DOC - VIEW))).toBe(false);
    expect(auto.update(at(DOC - VIEW + 30))).toBe(false);
  });

  it('바운스에서 돌아올 때(음수 → 0) 아래로 내린 것으로 세지 않는다', () => {
    const auto = createNavAutoHide();
    auto.update(at(-60));
    expect(auto.update(at(8))).toBe(false);
  });

  it('맨 아래 바운스에서 돌아올 때(넘침 → 끝) 위로 올린 것으로 본다 — 보인 채로', () => {
    const auto = createNavAutoHide();
    auto.update(at(DOC - VIEW + 40));
    expect(auto.update(at(DOC - VIEW - 20))).toBe(false);
  });

  it('내용이 화면보다 짧거나 스크롤 거리가 짧으면(내비 높이 + 문턱 미만) 늘 보인다 — 숨자마자 끝에 닿는 깜빡임 없게', () => {
    const auto = createNavAutoHide();
    expect(auto.update({ y: 0, viewport: VIEW, document: 500 })).toBe(false);
    expect(auto.update({ y: 50, viewport: VIEW, document: 500 })).toBe(false);
    const short = VIEW + MIN_SCROLL_RANGE - 1;
    auto.update({ y: 10, viewport: VIEW, document: short });
    expect(auto.update({ y: 60, viewport: VIEW, document: short })).toBe(false);
  });

  it('settle — 크기 바뀜(키보드)·경로 직후의 이동량은 세지 않고 숨김 상태는 그대로 둔다', () => {
    const auto = createNavAutoHide();
    auto.update(at(100));
    expect(auto.settle(at(400))).toBe(false);
    expect(auto.update(at(405))).toBe(false);
    auto.update(at(420));
    expect(auto.hidden).toBe(true);
    // 아래로 간 점프(스크롤 복원)는 숨김 그대로
    expect(auto.settle(at(900))).toBe(true);
  });

  it('settle 중이어도 끝(맨 위·맨 아래)에 닿으면 보인다 — 숨긴 채 끝에서 멈추지 않게', () => {
    const auto = createNavAutoHide();
    auto.update(at(100));
    auto.update(at(300));
    expect(auto.hidden).toBe(true);
    expect(auto.settle(at(DOC - VIEW))).toBe(false);
    auto.update(at(1000));
    auto.update(at(1200));
    expect(auto.settle(at(-10))).toBe(false);
  });

  it('settle 중에도 위로 올리면(주소창이 펴지며 resize) 보인다 — 아래로 간 것만 세지 않는다', () => {
    const auto = createNavAutoHide();
    auto.update(at(1000));
    auto.update(at(1100));
    expect(auto.hidden).toBe(true);
    expect(auto.settle(at(1101))).toBe(true);
    expect(auto.settle(at(1099))).toBe(false);
  });
});

