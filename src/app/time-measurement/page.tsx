"use client";

import { useState, useEffect, Suspense, type JSX } from "react";
import { useRouter } from "next/navigation";
import { TeamsPageLayout, SectionLabel, Skeleton } from "@/app/teams/components";
import { useSafeNavigation } from "@/app/hooks";
import { cardStyles } from "@/styles/teams";
import BatteryAnimation from "./components/BatteryAnimation";
import OrbitAnimation from "./components/OrbitAnimation";
import WaveAnimation from "./components/WaveAnimation";
import RingAnimation from "./components/RingAnimation";

/** 남은 시간을 시, 분, 초 등 다양한 형식으로 저장하기 위한 인터페이스 */
interface TimeLeft {
  totalSeconds: number;
  totalMinutes: number;
  hours: number;
  minutes: number;
  seconds: number;
}

type AnimationType = "battery" | "orbit" | "wave" | "ring";

/** 공통 입력 스타일 */
const inputStyles =
  "w-full rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 text-base font-mono text-white focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20";

/** 애니메이션 버튼 스타일 */
const baseButtonStyle =
  "flex-1 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-center transition-all duration-200";
const activeButtonStyle =
  "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/30 border-transparent";
const inactiveButtonStyle =
  "bg-white/5 text-slate-400 hover:text-white hover:border-white/30";

function TimeMeasurementContent() {
  const { searchParams, pathname, getParam } = useSafeNavigation();
  const router = useRouter();

  const getInitialTime = (paramName: string, defaultValue: string) => {
    const paramValue = getParam(paramName);
    return paramValue && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(paramValue)
      ? paramValue
      : defaultValue;
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [isTimeToGoHome, setIsTimeToGoHome] = useState(false);
  const [progress, setProgress] = useState(0);
  const [animationType, setAnimationType] = useState<AnimationType>("battery");
  const [startTime, setStartTime] = useState(getInitialTime("startTime", "09:00"));
  const [endTime, setEndTime] = useState(getInitialTime("endTime", "18:00"));

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();

      const start = new Date();
      const [startHours, startMinutes] = startTime.split(":").map(Number);
      start.setHours(startHours, startMinutes, 0, 0);

      const end = new Date();
      const [endHours, endMinutes] = endTime.split(":").map(Number);
      end.setHours(endHours, endMinutes, 0, 0);

      const totalWorkSeconds = end.getTime() - start.getTime();
      const elapsedSeconds = now.getTime() - start.getTime();

      let currentProgress = (elapsedSeconds / totalWorkSeconds) * 100;
      if (currentProgress < 0) currentProgress = 0;
      if (currentProgress > 100) currentProgress = 100;

      setProgress(currentProgress);

      if (now.getTime() >= end.getTime()) {
        setIsTimeToGoHome(true);
        setTimeLeft({
          totalSeconds: 0,
          totalMinutes: 0,
          hours: 0,
          minutes: 0,
          seconds: 0,
        });
        return;
      }

      setIsTimeToGoHome(false);
      const difference = end.getTime() - now.getTime();
      const totalSeconds = Math.floor(difference / 1000);
      const totalMinutes = Math.floor(difference / (1000 * 60));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / (1000 * 60)) % 60);
      const seconds = Math.floor((difference / 1000) % 60);
      setTimeLeft({ totalSeconds, totalMinutes, hours, minutes, seconds });
    };

    calculateTime();
    const intervalId = setInterval(calculateTime, 1000);

    return () => clearInterval(intervalId);
  }, [startTime, endTime]);

  const handleTimeChange = (type: "start" | "end", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "start") {
      setStartTime(value);
      params.set("startTime", value);
    } else {
      setEndTime(value);
      params.set("endTime", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const formatTime = (num: number) => num.toString().padStart(2, "0");

  const animationComponents: Record<
    AnimationType,
    (props: { progress: number }) => JSX.Element
  > = {
    battery: BatteryAnimation,
    orbit: OrbitAnimation,
    wave: WaveAnimation,
    ring: RingAnimation,
  };

  const renderAnimation = () => {
    const SelectedAnimation = animationComponents[animationType] ?? BatteryAnimation;
    return <SelectedAnimation progress={progress} />;
  };

  const animationOptions: { value: AnimationType; label: string }[] = [
    { value: "battery", label: "배터리" },
    { value: "orbit", label: "오비트" },
    { value: "wave", label: "웨이브" },
    { value: "ring", label: "포커스 링" },
  ];

  return (
    <TeamsPageLayout>
      {/* 헤더 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        <SectionLabel spacing="wide">Time Tracker</SectionLabel>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-300">
            시작 {startTime}
          </span>
          <span className="rounded-full border border-white/10 bg-slate-900/40 px-3 py-1.5 text-xs font-semibold text-slate-300">
            종료 {endTime}
          </span>
        </div>
      </section>

      {/* 애니메이션 & 진행률 섹션 */}
      <section className={`${cardStyles.section} p-4`}>
        <div className="flex h-48 items-center justify-center rounded-2xl bg-slate-900/60">
          {isTimeToGoHome ? (
            <p className="px-4 text-xl font-bold text-emerald-300">
              설정한 시간이 완료되었습니다
            </p>
          ) : (
            renderAnimation()
          )}
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>진행률</span>
            <span className="font-semibold text-white">{progress.toFixed(2)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </section>

      {/* 남은 시간 섹션 */}
      {timeLeft && !isTimeToGoHome && (
        <section className={`${cardStyles.section} p-4 text-center`}>
          <p className="text-xs uppercase tracking-widest text-slate-400">남은 시간</p>
          <p className="mt-2 text-4xl font-mono tracking-widest text-white">
            {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:
            {formatTime(timeLeft.seconds)}
          </p>

          {/* 통계 그리드 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">분 단위</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {timeLeft.totalMinutes.toLocaleString()} 분
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
              <p className="text-xs uppercase tracking-wide text-slate-400">진행률</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {progress.toFixed(2)} %
              </p>
            </div>
          </div>
        </section>
      )}

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
            />
          </div>

          {/* 애니메이션 선택 */}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-300">애니메이션 선택</p>
            <div className="grid grid-cols-2 gap-2">
              {animationOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAnimationType(option.value)}
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

/** 로딩 스켈레톤 */
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
