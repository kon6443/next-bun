"use client";

import { useEffect } from "react";
import { useLazyRef } from "@/app/games/_shared/hooks/useLazyRef";
import { useSoundSettings } from "@/app/games/_shared/hooks/useSoundSettings";
import { getSoundSettings } from "@/app/games/_shared/lib/soundSettings";
import { registerSoundUnlock } from "@/app/games/_shared/lib/soundUnlock";
import { SOUND, Sfx } from "../audio/sfx";

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
 * 디펜스 효과음 — 플레이·다시보기가 같이 쓴다. 켜기·음량은 게임 공통 소리 설정(효과음)을 따른다 (games-polish P8)
 * 꺼져 있으면 컨텍스트를 만들지 않는다. 켜져 있는데 아직 소리가 안 나면(저장값 켜짐·제스처 전 suspended·iOS 끊김)
 * 사용자 활성화 이벤트마다 다시 시도하고, 공통 소리 모달의 켜는 클릭에서도 깨운다(soundUnlock). 화면을 떠나면 닫는다
 */
export function useDefenseSfx(): Sfx {
  const sfx = useLazyRef(() => new Sfx()).current;
  const { settings } = useSoundSettings();
  const enabled = settings.sfx;
  useEffect(() => sfx.setVolume(settings.sfxVolume), [sfx, settings.sfxVolume]);
  useEffect(() => {
    if (!enabled) {
      sfx.setEnabled(false);
      return;
    }
    // 이미 만든 컨텍스트면 바로 켠다 — 처음 만드는 것은 아래 제스처에서만(제스처 밖에서 만들면 iOS가 소리를 내지 않는다)
    if (sfx.created) sfx.setEnabled(true);
    const unlock = () => {
      if (sfx.created && !sfx.waitingForGesture) return;
      sfx.setEnabled(true);
      sfx.unlock();
    };
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock);
    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock);
    };
  }, [sfx, enabled]);
  // 모달의 켜는 클릭 — 저장은 이미 끝났으니 지금 설정을 본다
  useEffect(
    () =>
      registerSoundUnlock(() => {
        if (!getSoundSettings().sfx) return;
        sfx.setEnabled(true);
        sfx.unlock();
      }),
    [sfx],
  );
  useEffect(() => () => sfx.dispose(), [sfx]);
  return sfx;
}
