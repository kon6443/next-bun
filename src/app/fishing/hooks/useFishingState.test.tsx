// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { Fish } from '../types/fish';
import type { FishingPoint } from '../types/game';
import { BITE_TIME_LIMIT, CASTING_DURATION } from '../config/constants';
import { useFishingState } from './useFishingState';

/** 대기 시간이 정확히 2초인 물고기 하나 — 무작위 없이 상태 전환 시각을 맞춘다 */
const fish: Fish = {
  id: 'test',
  name: '테스트',
  grade: 'common',
  minSize: 10,
  maxSize: 10,
  baseWeight: 100,
  catchWeight: 1,
  waitTimeRange: [2, 2],
  difficulty: 0,
  description: '',
  color: '#fff',
};
const point: FishingPoint = { id: 'point-1', position: { x: 0, y: 0 }, radius: 10 };

const strict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

function setup() {
  let renders = 0;
  const hook = renderHook(
    () => {
      renders++;
      return useFishingState([fish]);
    },
    { wrapper: strict },
  );
  return { hook, renders: () => renders };
}

/** 화면 프레임처럼 한 번에 한 프레임씩 */
function frames(hook: ReturnType<typeof setup>['hook'], seconds: number, dt = 1 / 60) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) act(() => hook.result.current.updateFishing(dt));
}

afterEach(cleanup);

describe('useFishingState (B7)', () => {
  it('StrictMode에서도 캐스팅 시간이 한 배로 흐른다 — updater 안 타이머 변이 제거', () => {
    const { hook } = setup();
    act(() => hook.result.current.startFishing(point));
    // 캐스팅 시간의 60%만 지났다 — 예전엔 StrictMode의 updater 이중 호출로 두 배(120%)가 흘러 대기로 넘어갔다
    act(() => hook.result.current.updateFishing(CASTING_DURATION * 0.6));
    expect(hook.result.current.fishingCtx.state).toBe('casting');
    act(() => hook.result.current.updateFishing(CASTING_DURATION * 0.5));
    expect(hook.result.current.fishingCtx.state).toBe('waiting');
  });

  it('입질·챌린지 동안 게이지는 프레임마다 바뀌지만 상태(낚시 화면)는 전환에서만 다시 그린다', () => {
    const { hook, renders } = setup();
    act(() => hook.result.current.startFishing(point));
    frames(hook, CASTING_DURATION + 0.05);
    frames(hook, 2.05);
    expect(hook.result.current.fishingCtx.state).toBe('bite');

    // 입질 1초(60프레임)
    const biteStart = renders();
    const bites: number[] = [];
    for (let i = 0; i < 60; i++) {
      act(() => hook.result.current.updateFishing(1 / 60));
      bites.push(hook.result.current.fishingLive.get().biteTimeLeft);
    }
    expect(renders() - biteStart).toBe(0);
    // 남은 시간은 프레임마다 1/60초만큼 준다
    expect(bites[0] - (bites.at(-1) ?? 0)).toBeCloseTo(59 / 60 / BITE_TIME_LIMIT, 5);
    expect(new Set(bites).size).toBe(60);

    act(() => hook.result.current.onBiteTap());
    expect(hook.result.current.fishingCtx.state).toBe('challenge');
    const challengeStart = renders();
    const gauges: number[] = [];
    for (let i = 0; i < 60; i++) {
      act(() => hook.result.current.updateFishing(1 / 60));
      gauges.push(hook.result.current.fishingLive.get().challengeGauge);
    }
    // 예전엔 프레임마다(60번, StrictMode면 120번) 다시 그렸다
    expect(renders() - challengeStart).toBe(0);
    expect(new Set(gauges).size).toBeGreaterThan(30);
  });

  it('챌린지 판정은 지금 게이지 값 그대로 — 구간 안이면 성공, 잡은 물고기는 한 마리만', () => {
    const { hook } = setup();
    act(() => hook.result.current.startFishing(point));
    frames(hook, CASTING_DURATION + 0.05);
    frames(hook, 2.05);
    act(() => hook.result.current.onBiteTap());
    const [lo, hi] = hook.result.current.fishingCtx.challengeZone;
    // 게이지를 구간 가운데까지 움직인다
    let guard = 0;
    while (hook.result.current.fishingLive.get().challengeGauge < (lo + hi) / 2 && guard++ < 600) {
      act(() => hook.result.current.updateFishing(1 / 240));
    }
    act(() => hook.result.current.onChallengeTap());
    expect(hook.result.current.fishingCtx.state).toBe('success');
    expect(hook.result.current.fishingCtx.inventory).toHaveLength(1);
  });

  it('입질 시간이 다 되면 실패로 넘어가고 남은 시간은 0', () => {
    const { hook } = setup();
    act(() => hook.result.current.startFishing(point));
    frames(hook, CASTING_DURATION + 0.05);
    frames(hook, 2.05);
    frames(hook, BITE_TIME_LIMIT + 0.05);
    expect(hook.result.current.fishingCtx.state).toBe('fail');
    expect(hook.result.current.fishingLive.get().biteTimeLeft).toBe(0);
  });
});
