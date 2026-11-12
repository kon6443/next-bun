"use client";

import { useDialog } from "@/app/hooks/useDialog";
import { useMediaQuery } from "@/app/games/_shared/hooks/useMediaQuery";
import { Button } from "@/app/teams/components/Button";
import { KEY_GUIDE, TOUCH_GUIDE } from "../lib/controlGuide";
import { EYEBROW } from "./fortressUi";

/** 처음 1회 안내를 봤는지 — 저장이 막혀도(사생활 모드 등) 동작은 같고 다음 방문에 다시 보일 뿐이다 */
const GUIDE_SEEN_KEY = "fortress:guide:v1";

export function readGuideSeen(): boolean {
  try {
    return window.localStorage.getItem(GUIDE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGuideSeen(): void {
  try {
    window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
  } catch {
    // 저장 실패는 무시 — 다음 방문에 한 번 더 보인다
  }
}

/** 조작 안내 — 경기 첫 진입에 한 번, 이후엔 상단 ? 버튼으로. 키보드 기기는 키 표, 터치 기기는 버튼 표(TetrisPlay ControlGuide와 같은 모양) */
export function FortressGuide({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const items = isCoarse ? TOUCH_GUIDE : KEY_GUIDE;
  return (
    <div className="absolute inset-0 z-20 flex overflow-y-auto bg-slate-950/70 p-4" style={{ touchAction: "auto" }}>
      <div className="m-auto flex w-full justify-center">
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="fortress-guide-title" tabIndex={-1} className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900/95 p-6 text-center outline-none" data-testid="fortress-guide">
          <p className={EYEBROW}>FORTRESS</p>
          <h2 id="fortress-guide-title" className="mt-2 text-2xl font-bold text-white">
            조작 안내
          </h2>
          <p className="mt-2 text-sm text-slate-400">차례가 오면 이동·각도·파워를 맞추고 쏘세요. 반투명 탱크가 이번에 이동할 자리, 노란 점선이 탄이 날아갈 앞부분, X가 지난 발 자리예요.</p>
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-left text-xs">
            {items.map(({ keys, label }) => (
              <div key={keys} className="contents">
                <dt className="font-mono font-semibold text-sky-300">{keys}</dt>
                <dd className="text-slate-400">{label}</dd>
              </div>
            ))}
          </dl>
          <Button type="button" size="md" fullWidth className="mt-6 min-h-11" onClick={onClose}>
            알겠어요
          </Button>
        </div>
      </div>
    </div>
  );
}
