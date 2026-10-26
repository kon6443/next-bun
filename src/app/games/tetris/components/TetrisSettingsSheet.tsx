"use client";

import { type ReactNode, type Ref, useRef, useState } from "react";
import { SettingsSheet } from "@/app/components/SettingsSheet";
import { SoundSettingsSection } from "@/app/games/_shared/components/SoundSettingsModal";
import { framesToMs } from "@/app/games/_shared/lib/format";
import { ARR_MAX, ARR_MIN, DAS_MAX, DAS_MIN } from "../engine";
import { useMySkins } from "../hooks/useMySkins";
import { useTetrisSettings } from "../hooks/useTetrisSettings";
import { CONTROL_GUIDE } from "../lib/controls";
import { SKIN_ITEM_LABELS, SKIN_SLOTS, SKIN_SLOT_LABELS } from "../lib/skins";
import { EffectsToggle } from "./EffectsToggle";
import { SkinSettingsSection } from "./SkinSettingsModal";

/**
 * 조작(DAS·ARR) 변경 규칙 — 판을 시작할 때 엔진·리플레이 헤더에 들어가므로 진행 중인 판에는 반영하지 않는다
 * - edit: 판 밖(홈·리플레이) · next-game: 싱글 플레이 중 — 다음 판부터 · locked: 대전 중 — 입장할 때 값으로 끝까지(읽기만)
 */
export type ControlsMode = "edit" | "next-game" | "locked";

type Props = {
  onClose: () => void;
  controls?: ControlsMode;
};

/**
 * 테트리스 설정 시트(D-001) — 소리·조작·연출·스킨을 한 곳에서. 홈·플레이 HUD·일시정지·리플레이·대전에서 같은 시트
 * 스킨은 카드가 많아 시트 안 두 번째 화면으로(제목 줄 ← 로 목록으로 돌아온다) — 모달을 겹쳐 열지 않는다
 */
export function TetrisSettingsSheet({ onClose, controls = "edit" }: Props) {
  const [view, setView] = useState<"main" | "skin">("main");
  /** 스킨 화면에서 돌아오면 스킨 줄로 포커스 — 누른 자리로 돌아온다 */
  const skinRowRef = useRef<HTMLButtonElement>(null);
  const backToMain = () => {
    setView("main");
    requestAnimationFrame(() => skinRowRef.current?.focus());
  };

  return (
    <SettingsSheet
      title={view === "skin" ? "스킨" : "설정"}
      testId="tetris-settings"
      size="md"
      onClose={onClose}
      headerStart={
        view === "skin" && (
          // 바뀐 화면의 첫 컨트롤 — 누른 줄이 사라지니 포커스를 여기로
          <button
            type="button"
            onClick={backToMain}
            aria-label="설정 목록으로"
            autoFocus
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-slate-300 hover:text-white"
          >
            ←
          </button>
        )
      }
    >
      {view === "skin" ? (
        <SkinSettingsSection onNavigate={onClose} />
      ) : (
        <div className="min-h-0 overflow-y-auto">
          <Section title="소리">
            <SoundSettingsSection />
          </Section>
          <Section title="조작">
            <TetrisControlsSection mode={controls} />
          </Section>
          <Section title="연출">
            <EffectsToggle />
          </Section>
          <Section title="스킨">
            <SkinRow ref={skinRowRef} onOpen={() => setView("skin")} />
          </Section>
        </div>
      )}
    </SettingsSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 py-3 first:border-t-0 first:pt-0">
      <h3 className="mb-1 text-sm font-semibold text-slate-200">{title}</h3>
      {children}
    </section>
  );
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

/** 스킨 줄 — 지금 장착을 한 줄로, 누르면 시트 안 스킨 화면 */
function SkinRow({ onOpen, ref }: { onOpen: () => void; ref: Ref<HTMLButtonElement> }) {
  const { equipped, loggedIn } = useMySkins();
  const summary = loggedIn
    ? SKIN_SLOTS.map((s) => `${SKIN_SLOT_LABELS[s]} ${SKIN_ITEM_LABELS[equipped[s]] ?? equipped[s]}`).join(" · ")
    : "로그인하면 스킨 선택";
  return (
    <button
      ref={ref}
      type="button"
      data-testid="skin-settings-entry"
      onClick={onOpen}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-white/5"
    >
      <span className="flex-1">
        <span className="block text-sm text-slate-100">스킨 바꾸기</span>
        <span className="block text-xs text-slate-400">{summary}</span>
      </span>
      <span aria-hidden="true" className="text-slate-400">
        ›
      </span>
    </button>
  );
}
