"use client";

import { useEffect } from "react";
import { useLazyRef } from "@/app/games/_shared/hooks/useLazyRef";
import { SOUND, Sfx } from "../audio/sfx";

/** 소리 버튼 — 끄려는 손짓에 컨텍스트를 만들지 않게 이 요소의 제스처는 건너뛴다 */
const SOUND_TOGGLE_SELECTOR = '[data-testid="defense-sound"]';
/** 사용자 활성화를 주는 이벤트 — 터치의 pointerdown은 활성화가 아니다 */
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

type CommandOps = { BUILD: number; SELL: number; UPGRADE: number; BRANCH: number; CALL_WAVE: number };

/** 받아들여진 명령의 소리 — 건설·판매·업그레이드(분기 포함)·웨이브 호출. 없으면 -1 (ops는 그 판의 엔진 OP) */
export function commandSound(op: number, ops: CommandOps): number {
  if (op === ops.BUILD) return SOUND.BUILD;
  if (op === ops.SELL) return SOUND.SELL;
  if (op === ops.UPGRADE || op === ops.BRANCH) return SOUND.UPGRADE;
  if (op === ops.CALL_WAVE) return SOUND.WAVE_START;
  return -1;
}

/**
 * 디펜스 효과음 — 플레이·다시보기가 같이 쓴다 (games-polish P7)
 * 꺼져 있으면 컨텍스트를 만들지 않는다. 켜져 있는데 아직 소리가 안 나면(저장값 켜짐·제스처 전 suspended·iOS 끊김)
 * 사용자 활성화 이벤트마다 다시 시도한다. 화면을 떠나면 닫는다
 */
export function useDefenseSfx(enabled: boolean): Sfx {
  const sfx = useLazyRef(() => new Sfx()).current;
  useEffect(() => {
    if (!enabled) {
      sfx.setEnabled(false);
      return;
    }
    // 이미 만든 컨텍스트면 바로 켠다 — 처음 만드는 것은 아래 제스처에서만(제스처 밖에서 만들면 iOS가 소리를 내지 않는다)
    if (sfx.created) sfx.setEnabled(true);
    const unlock = (e: Event) => {
      if (sfx.created && !sfx.waitingForGesture) return;
      if (e.target instanceof Element && e.target.closest(SOUND_TOGGLE_SELECTOR)) return;
      sfx.setEnabled(true);
      sfx.unlock();
    };
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock);
    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock);
    };
  }, [sfx, enabled]);
  useEffect(() => () => sfx.dispose(), [sfx]);
  return sfx;
}
