"use client";

import { useState, useEffect, useId, Suspense, type JSX } from "react";
import { useRouter } from "next/navigation";
import { TeamsPageLayout, SectionLabel, Skeleton } from "@/app/teams/components";
import { useSafeNavigation } from "@/app/hooks";
import { cardStyles } from "@/styles/teams";
import {
  computeTimeRangeState,
  normalizeTimeValue,
  splitDuration,
  type TimeRangeState,
} from "@/app/utils/timeRange";
import BatteryAnimation from "./components/BatteryAnimation";
import OrbitAnimation from "./components/OrbitAnimation";
import WaveAnimation from "./components/WaveAnimation";
import RingAnimation from "./components/RingAnimation";

type AnimationType = "battery" | "orbit" | "wave" | "ring";

const DEFAULT_START = "09:00";
const DEFAULT_END = "18:00";

const ANIMATION_COMPONENTS: Record<AnimationType, (props: { progress: number }) => JSX.Element> = {
  battery: BatteryAnimation,
  orbit: OrbitAnimation,
  wave: WaveAnimation,
  ring: RingAnimation,
};

const ANIMATION_OPTIONS: { value: AnimationType; label: string }[] = [
  { value: "battery", label: "배터리" },
  { value: "orbit", label: "궤도" },
  { value: "wave", label: "파도" },
  { value: "ring", label: "링" },
];

function parseAnimationParam(value: string): AnimationType {
  return ANIMATION_OPTIONS.some(option => option.value === value) ? (value as AnimationType) : "battery";
}

const pad2 = (num: number) => num.toString().padStart(2, "0");

/** ms → "HH:MM:SS" */
function formatClock(ms: number): string {
  const { hours, minutes, seconds } = splitDuration(ms);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

/** 공통 입력 스타일 */
const inputStyles =
  "w-full max-w-full box-border appearance-none rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base font-mono text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20";

/** 애니메이션 버튼 스타일 */
const baseButtonStyle =
  "flex-1 min-h-[44px] rounded-full border border-white/10 px-4 py-2.5 text-sm font-semibold text-center transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:outline-none";
const activeButtonStyle =
  "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/30 border-transparent";
const inactiveButtonStyle =
  "bg-white/5 text-slate-400 hover:text-white hover:border-white/30";

/** 화면에 표시할 값 — 상태별로 섹션 구성을 유지해 상태가 바뀌어도 레이아웃이 크게 움직이지 않게 한다 */
function describeState(state: TimeRangeState) {
  switch (state.phase) {
    case "invalid":
      return { progress: 0, clockLabel: "남은 시간", clockMs: 0, elapsedMs: 0, badge: null };
    case "before":
      return { progress: 0, clockLabel: "시작까지", clockMs: state.untilStartMs, elapsedMs: 0, badge: "시작 전" };
    case "running":
      return {
        progress: state.progress,
        clockLabel: "남은 시간",
        clockMs: state.remainingMs,
        elapsedMs: state.elapsedMs,
        badge: null,
      };
    case "done":
      return { progress: 100, clockLabel: "남은 시간", clockMs: 0, elapsedMs: state.totalMs, badge: "완료" };
  }
}

/** 다음 초 경계에 맞춰 1초마다 현재 시각을 갱신한다 (탭이 다시 보이면 즉시 갱신) */
function useSecondClock(): Date | null {
  // 서버 렌더와 첫 클라이언트 렌더가 어긋나지 않게 마운트 후부터 시각을 쓴다
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      // setInterval(1000)은 마운트 시점 기준이라 초 표시가 가끔 건너뛴다 — 매번 다음 초 경계로 맞춘다
      timer = setTimeout(tick, 1000 - current.getMilliseconds());
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return now;
}

function TimeMeasurementContent() {
  const { searchParams, pathname, getParam } = useSafeNavigation();
  const router = useRouter();
  const animationLabelId = useId();

  const [startTime, setStartTime] = useState(() => normalizeTimeValue(getParam("startTime")) ?? DEFAULT_START);
  const [endTime, setEndTime] = useState(() => normalizeTimeValue(getParam("endTime")) ?? DEFAULT_END);
  const [animationType, setAnimationType] = useState<AnimationType>(() => parseAnimationParam(getParam("anim")));
  const now = useSecondClock();

  // 설정 변경은 URL에 남기되 히스토리를 쌓지 않는다 (뒤로가기가 입력 이력을 거슬러 가지 않게)
  const replaceParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleTimeChange = (type: "start" | "end", value: string) => {
    // 지우기 버튼 등으로 비거나 형식이 틀린 값은 반영하지 않는다 (NaN 계산 방지, 직전 유효값 유지)
    const normalized = normalizeTimeValue(value);
    if (!normalized) return;
    if (type === "start") {
      setStartTime(normalized);
      replaceParam("startTime", normalized);
    } else {
      setEndTime(normalized);
      replaceParam("endTime", normalized);
    }
  };

  const handleAnimationChange = (value: AnimationType) => {
    setAnimationType(value);
    replaceParam("anim", value);
  };

  const state = now ? computeTimeRangeState(now, startTime, endTime) : null;
  const view = state ? describeState(state) : null;
  const SelectedAnimation = ANIMATION_COMPONENTS[animationType];
  const remainingMinutes = view ? Math.floor(view.clockMs / 60000) : 0;

  return (
    <TeamsPageLayout>
      {/* 헤더 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        <SectionLabel spacing="wide">시간 측정</SectionLabel>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-300 tabular-nums">
            시작 {startTime}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-300 tabular-nums">
            종료 {endTime}
            {endTime < startTime && <span className="ml-1 text-slate-400">(다음 날)</span>}
          </span>
        </div>
      </section>

      {/* 애니메이션 & 진행률 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        <div className="flex h-48 items-center justify-center rounded-2xl bg-slate-900/60">
          {state?.phase === "invalid" ? (
            <p className="px-4 text-center text-base font-semibold text-amber-300">
              시작과 종료 시각이 같습니다. 시각을 다르게 설정해 주세요.
            </p>
          ) : view ? (
            // 장식 애니메이션 — 수치는 아래 진행률·남은 시간이 읽어 준다
            <div aria-hidden="true">
              <SelectedAnimation progress={view.progress} />
            </div>
          ) : (
            <Skeleton width="160px" height="160px" rounded="2xl" />
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>진행률</span>
            <span className="font-semibold text-white tabular-nums">{view ? `${view.progress.toFixed(2)}%` : "--"}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label="진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view ? Math.round(view.progress) : 0}
          >
            {/* width 대신 transform 으로 채워 매 초 레이아웃을 다시 계산하지 않는다 */}
            <div
              className="h-full w-full origin-left rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 transition-transform duration-300 motion-reduce:transition-none"
              style={{ transform: `scaleX(${(view?.progress ?? 0) / 100})` }}
            />
          </div>
        </div>
      </section>

      {/* 남은 시간 섹션 — 상태와 관계없이 항상 그려 레이아웃이 밀리지 않게 */}
      <section className={`${cardStyles.section} p-4 text-center`}>
        <div className="flex items-center justify-center gap-2">
          <p className="text-xs uppercase tracking-widest text-slate-400">{view?.clockLabel ?? "남은 시간"}</p>
          {view?.badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                state?.phase === "done"
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-sky-500/15 text-sky-300"
              }`}
            >
              {view.badge}
            </span>
          )}
        </div>
        <p className="mt-2 text-3xl sm:text-4xl font-mono tabular-nums tracking-wider sm:tracking-widest text-white">
          {view ? formatClock(view.clockMs) : "--:--:--"}
        </p>

        {/* 통계 그리드 */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">분 단위</p>
            <p className="mt-1 text-xl font-semibold text-white tabular-nums">
              {view ? `${remainingMinutes.toLocaleString()} 분` : "--"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">경과 시간</p>
            <p className="mt-1 text-xl font-semibold text-white tabular-nums">
              {view ? formatClock(view.elapsedMs) : "--"}
            </p>
          </div>
        </div>
      </section>

      {/* 설정 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        <SectionLabel spacing="tight">설정</SectionLabel>

        <div className="mt-4 space-y-4">
          {/* 시작 시간 */}
          <div>
            <label htmlFor="startTime" className="mb-2 block text-sm font-semibold text-slate-300">
              시작 시간
            </label>
            <input
              type="time"
              id="startTime"
              value={startTime}
              onChange={(e) => handleTimeChange("start", e.target.value)}
              className={inputStyles}
            />
          </div>

          {/* 종료 시간 */}
          <div>
            <label htmlFor="endTime" className="mb-2 block text-sm font-semibold text-slate-300">
              종료 시간
            </label>
            <input
              type="time"
              id="endTime"
              value={endTime}
              onChange={(e) => handleTimeChange("end", e.target.value)}
              className={inputStyles}
              aria-describedby="endTimeHint"
            />
            <p id="endTimeHint" className="mt-1 text-xs text-slate-400">
              종료가 시작보다 이르면 다음 날 종료로 계산합니다.
            </p>
          </div>

          {/* 애니메이션 선택 */}
          <div>
            <p id={animationLabelId} className="mb-2 text-sm font-semibold text-slate-300">애니메이션 선택</p>
            <div role="group" aria-labelledby={animationLabelId} className="grid grid-cols-2 gap-2">
              {ANIMATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleAnimationChange(option.value)}
                  className={`${baseButtonStyle} ${
                    animationType === option.value ? activeButtonStyle : inactiveButtonStyle
                  }`}
                  aria-pressed={animationType === option.value}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </TeamsPageLayout>
  );
}

/** 로딩 스켈레톤 — 실제 화면과 같은 섹션 구성 (로드 직후 레이아웃 점프 방지) */
function TimeMeasurementSkeleton() {
  return (
    <TeamsPageLayout>
      <section className={`${cardStyles.section} p-4`}>
        <Skeleton width="100px" height="0.625rem" />
        <div className="mt-4 flex gap-2">
          <Skeleton width="80px" height="1.75rem" rounded="full" />
          <Skeleton width="80px" height="1.75rem" rounded="full" />
        </div>
      </section>

      <section className={`${cardStyles.section} p-4`}>
        <Skeleton width="100%" height="12rem" rounded="2xl" />
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <Skeleton width="50px" height="0.875rem" />
            <Skeleton width="60px" height="0.875rem" />
          </div>
          <Skeleton width="100%" height="0.5rem" rounded="full" />
        </div>
      </section>

      <section className={`${cardStyles.section} p-4`}>
        <div className="flex flex-col items-center gap-2">
          <Skeleton width="60px" height="0.75rem" />
          <Skeleton width="180px" height="2.25rem" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Skeleton width="100%" height="4.5rem" rounded="2xl" />
          <Skeleton width="100%" height="4.5rem" rounded="2xl" />
        </div>
      </section>

      <section className={`${cardStyles.section} p-4`}>
        <Skeleton width="60px" height="0.625rem" />
        <div className="mt-4 space-y-4">
          <div>
            <Skeleton width="80px" height="0.875rem" className="mb-2" />
            <Skeleton width="100%" height="3rem" rounded="xl" />
          </div>
          <div>
            <Skeleton width="80px" height="0.875rem" className="mb-2" />
            <Skeleton width="100%" height="3rem" rounded="xl" />
          </div>
          <div>
            <Skeleton width="100px" height="0.875rem" className="mb-2" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} width="100%" height="2.75rem" rounded="full" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </TeamsPageLayout>
  );
}

export default function TimeMeasurementPage() {
  return (
    <Suspense fallback={<TimeMeasurementSkeleton />}>
      <TimeMeasurementContent />
    </Suspense>
  );
}
