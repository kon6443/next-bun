"use client";

import { useSyncExternalStore } from "react";
import {
  getReducedEffectsPref,
  prefersReducedMotion,
  saveReducedEffectsPref,
  subscribeReducedEffects,
} from "../lib/effectsSettings";

type ToggleSnapshot = "auto-on" | "auto-off" | "on" | "off";

/** 설정값과 기기 설정을 한 문자열로 — useSyncExternalStore 스냅샷은 같은 값이면 같은 참조여야 한다 */
function getSnapshot(): ToggleSnapshot {
  const pref = getReducedEffectsPref();
  if (pref !== "auto") return pref;
  return prefersReducedMotion() ? "auto-on" : "auto-off";
}

const getServerSnapshot = (): ToggleSnapshot => "auto-off";

/**
 * "연출 줄이기" 체크박스 — 처음에는 기기 설정(동작 줄이기)을 따르고, 바꾸면 이 기기에 저장한다
 */
export function EffectsToggle({ className = "" }: { className?: string }) {
  const snapshot = useSyncExternalStore(subscribeReducedEffects, getSnapshot, getServerSnapshot);
  const isAuto = snapshot === "auto-on" || snapshot === "auto-off";
  const checked = snapshot === "on" || snapshot === "auto-on";

  return (
    <div className={className}>
      <label className="flex min-h-11 items-center justify-between gap-3 text-left text-sm text-slate-300">
        <span>
          연출 줄이기
          <span className="block text-xs text-slate-500">
            {isAuto
              ? "기기의 동작 줄이기 설정을 따르는 중"
              : checked
                ? "흔들림·파티클·잔상을 끄고 문구만 보여 줘요"
                : "모든 연출을 보여 줘요"}
          </span>
        </span>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => saveReducedEffectsPref(e.target.checked ? "on" : "off")}
          className="h-5 w-5 shrink-0 accent-sky-400"
        />
      </label>
      {!isAuto && (
        <button
          type="button"
          onClick={() => saveReducedEffectsPref("auto")}
          className="min-h-11 text-xs text-sky-300 underline-offset-2 hover:underline"
        >
          기기 설정 따르기
        </button>
      )}
    </div>
  );
}
