"use client";

import { SettingsGroupSheet, type SettingsGroup } from "@/app/components/SettingsGroupSheet";
import { SoundSettingsSection } from "@/app/games/_shared/components/SoundSettingsModal";
import { useSoundSettings } from "@/app/games/_shared/hooks/useSoundSettings";
import { framesToMs } from "@/app/games/_shared/lib/format";
import { ARR_MAX, ARR_MIN, DAS_MAX, DAS_MIN } from "../engine";
import { useMySkins } from "../hooks/useMySkins";
import { useTetrisSettings } from "../hooks/useTetrisSettings";
import { CONTROL_GUIDE } from "../lib/controls";
import { SKIN_ITEM_LABELS, SKIN_SLOTS } from "../lib/skins";
import { EffectsToggle, useReducedEffectsSetting } from "./EffectsToggle";
import { SkinPreview } from "./SkinPreview";
import { SkinSettingsSection } from "./SkinSettingsModal";

/**
 * 조작(DAS·ARR) 변경 규칙 — 판을 시작할 때 엔진·리플레이 헤더에 들어가므로 진행 중인 판에는 반영하지 않는다
 * - edit: 판 밖(홈·리플레이) · next-game: 싱글 플레이 중 — 다음 판부터 · locked: 대전 중 — 입장할 때 값으로 끝까지(읽기만)
 */
export type ControlsMode = "edit" | "next-game" | "locked";

export type TetrisSettingsGroup = "skin" | "sound" | "controls" | "display";

type Props = {
  onClose: () => void;
  controls?: ControlsMode;
  /** 처음부터 이 그룹 상세로(홈 "내 스킨" 카드 → 스킨) */
  initialGroup?: TetrisSettingsGroup;
};

/**
 * 테트리스 설정 시트(D-001·D-006) — 첫 화면은 그룹 목록(스킨·소리·조작·화면, 지금 상태 한 줄), 누르면 상세
 * 홈·플레이 HUD·일시정지·리플레이·대전에서 같은 시트. 스킨이 맨 위(눈에 띄게, D-003)
 */
export function TetrisSettingsSheet({ onClose, controls = "edit", initialGroup }: Props) {
  const { equipped, loggedIn } = useMySkins();
  const { settings: sound } = useSoundSettings();
  const { settings } = useTetrisSettings();
  const effects = useReducedEffectsSetting();

  const groups: SettingsGroup[] = [
    {
      id: "skin",
      title: "스킨",
      // 게스트도 기본 스킨 미리보기 — 무엇을 바꿀 수 있는지 보이게
      preview: <SkinPreview slot="block" id={equipped.block} width={64} height={28} />,
      summary: loggedIn ? SKIN_SLOTS.map((slot) => SKIN_ITEM_LABELS[equipped[slot]] ?? equipped[slot]).join(" · ") : "로그인하고 스킨 꾸미기",
      content: <SkinSettingsSection onNavigate={onClose} />,
    },
    {
      id: "sound",
      title: "소리",
      summary: `효과음 ${sound.sfx ? "켜짐" : "꺼짐"} · 배경음 ${sound.music ? "켜짐" : "꺼짐"}`,
      content: <SoundSettingsSection />,
    },
    {
      id: "controls",
      title: "조작",
      summary: `DAS ${framesToMs(settings.das)}ms · ARR ${settings.arr === 0 ? "즉시" : `${framesToMs(settings.arr)}ms`}${controls === "locked" ? " · 대전 중 바꿀 수 없음" : ""}`,
      content: <TetrisControlsSection mode={controls} />,
    },
    {
      id: "display",
      title: "화면",
      summary: effects.auto ? "연출 — 기기 설정을 따르는 중" : effects.reduced ? "연출 줄이기 켜짐" : "모든 연출 보기",
      content: <EffectsToggle />,
    },
  ];

  return <SettingsGroupSheet title="설정" testId="tetris-settings" groups={groups} onClose={onClose} initialGroup={initialGroup} />;
}

/** 조작 설정 — DAS·ARR·진동 + 키 안내 */
export function TetrisControlsSection({ mode = "edit" }: { mode?: ControlsMode }) {
  const { settings, update } = useTetrisSettings();
  const das = `${framesToMs(settings.das)}ms`;
  const arr = settings.arr === 0 ? "즉시" : `${framesToMs(settings.arr)}ms`;

  return (
    <div className="space-y-3">
      {mode === "locked" ? (
        <>
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt className="text-slate-400">이동 반복 시작 (DAS)</dt>
            <dd className="font-mono text-sky-300">{das}</dd>
            <dt className="text-slate-400">이동 반복 간격 (ARR)</dt>
            <dd className="font-mono text-sky-300">{arr}</dd>
          </dl>
          <p className="text-xs text-slate-500">대전 중에는 바꿀 수 없어요. 방에 들어올 때의 값으로 플레이해요.</p>
        </>
      ) : (
        <>
          {mode === "next-game" && <p className="text-xs text-amber-200/80">DAS·ARR은 다음 판부터 적용돼요.</p>}
          <RangeSetting
            id="tetris-das"
            label="이동 반복 시작 (DAS)"
            hint="누르고 있을 때 연속 이동이 시작되기까지"
            min={DAS_MIN}
            max={DAS_MAX}
            value={settings.das}
            display={das}
            onChange={(value) => update({ das: value })}
          />
          <RangeSetting
            id="tetris-arr"
            label="이동 반복 간격 (ARR)"
            hint="0이면 벽까지 한 번에"
            min={ARR_MIN}
            max={ARR_MAX}
            value={settings.arr}
            display={arr}
            onChange={(value) => update({ arr: value })}
          />
        </>
      )}
      <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-300">
        <span>진동 (지원하는 기기)</span>
        <input
          type="checkbox"
          checked={settings.vibration}
          onChange={(e) => update({ vibration: e.target.checked })}
          className="h-5 w-5 shrink-0 accent-sky-400"
        />
      </label>
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center text-slate-300">키보드 조작 보기</summary>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          {CONTROL_GUIDE.map(({ keys, label }) => (
            <div key={keys} className="contents">
              <dt className="font-mono font-semibold text-sky-300">{keys}</dt>
              <dd className="text-slate-400">{label}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}

type RangeSettingProps = {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
};

function RangeSetting({ id, label, hint, min, max, value, display, onChange }: RangeSettingProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <label htmlFor={id} className="text-slate-300">
          {label}
        </label>
        <span className="font-mono text-sky-300">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={`${id}-hint`}
        className="mt-1 h-11 w-full accent-sky-400"
      />
      <p id={`${id}-hint`} className="text-xs text-slate-500">
        {hint}
      </p>
    </div>
  );
}
