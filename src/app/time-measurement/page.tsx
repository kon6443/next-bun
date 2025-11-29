"use client";

import { useState, useEffect, Suspense, type JSX } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import BatteryAnimation from "./components/BatteryAnimation";
import OrbitAnimation from "./components/OrbitAnimation";
import WaveAnimation from "./components/WaveAnimation";
import RingAnimation from "./components/RingAnimation";

// 남은 시간을 시, 분, 초 등 다양한 형식으로 저장하기 위한 인터페이스
interface TimeLeft {
  totalSeconds: number;
  totalMinutes: number;
  hours: number;
  minutes: number;
  seconds: number;
}

type AnimationType = "battery" | "orbit" | "wave" | "ring";

function LeavingOfficePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const getInitialTime = (paramName: string, defaultValue: string) => {
    const paramValue = searchParams.get(paramName);
    return paramValue && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(paramValue)
      ? paramValue
      : defaultValue;
  };

  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [isTimeToGoHome, setIsTimeToGoHome] = useState(false);
  const [progress, setProgress] = useState(0);
  const [animationType, setAnimationType] = useState<AnimationType>("battery");
  const [startTime, setStartTime] = useState(
    getInitialTime("startTime", "09:00")
  );
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
    const params = new URLSearchParams(searchParams);
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
    const SelectedAnimation =
      animationComponents[animationType] ?? BatteryAnimation;
    return <SelectedAnimation progress={progress} />;
  };

  const animationOptions: { value: AnimationType; label: string }[] = [
    { value: "battery", label: "배터리" },
    { value: "orbit", label: "오비트" },
    { value: "wave", label: "웨이브" },
    { value: "ring", label: "포커스 링" },
  ];

  const buttonStyle =
    "flex-1 min-w-[120px] rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-center transition-all duration-200";
  const activeButtonStyle =
    "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-sky-500/30 border-transparent";
  const inactiveButtonStyle =
    "bg-white/5 text-slate-400 hover:text-white hover:border-white/30";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-indigo-600/30 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-500/20 blur-[150px]" />
      </div>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-16 sm:px-8">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur-xl">
          <div className="flex flex-col gap-5 text-center sm:flex-row sm:items-end sm:justify-between sm:text-left">
            <div>
              <p className="text-xs uppercase tracking-[1em] text-slate-400">
                Time Tracker
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-slate-400 sm:justify-end">
              <span className="rounded-full border border-white/10 px-4 py-2 text-slate-200">
                시작 {startTime}
              </span>
              <span className="rounded-full border border-white/10 px-4 py-2 text-slate-200">
                종료 {endTime}
              </span>
            </div>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6 shadow-[0_25px_60px_rgba(2,6,23,0.6)]">
              <div className="flex h-56 items-center justify-center rounded-2xl bg-slate-900/60">
                {isTimeToGoHome ? (
                  <div className="px-4 text-2xl font-bold text-emerald-300 md:text-3xl">
                    설정한 시간이 완료되었습니다
                  </div>
                ) : (
                  renderAnimation()
                )}
              </div>

              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>진행률</span>
                  <span className="font-semibold text-white">
                    {progress.toFixed(2)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-slate-950/40 p-6 shadow-[0_20px_40px_rgba(2,6,23,0.45)]">
              <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                설정
              </p>

              <div className="mt-5 grid gap-5">
                <div className="space-y-2">
                  <label
                    htmlFor="startTime"
                    className="text-sm font-semibold text-slate-300"
                  >
                    시작 시간
                  </label>
                  <input
                    type="time"
                    id="startTime"
                    value={startTime}
                    onChange={(e) => handleTimeChange("start", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-lg font-mono text-white shadow-inner shadow-black/20 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
                <div className="space-y-2">
                  <label
                    htmlFor="endTime"
                    className="text-sm font-semibold text-slate-300"
                  >
                    종료 시간
                  </label>
                  <input
                    type="time"
                    id="endTime"
                    value={endTime}
                    onChange={(e) => handleTimeChange("end", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-lg font-mono text-white shadow-inner shadow-black/20 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-300">
                    애니메이션 선택
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {animationOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setAnimationType(option.value)}
                        className={`${buttonStyle} ${
                          animationType === option.value
                            ? activeButtonStyle
                            : inactiveButtonStyle
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
            </div>
          </div>

          {timeLeft && !isTimeToGoHome && (
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2 rounded-[24px] border border-white/10 bg-slate-950/40 p-6 text-center">
                <p className="text-sm uppercase tracking-[0.6em] text-slate-400">
                  남은 시간
                </p>
                <p className="mt-3 text-5xl font-mono tracking-widest text-white">
                  {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:
                  {formatTime(timeLeft.seconds)}
                </p>
              </div>
              <div className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                    분 단위
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {timeLeft.totalMinutes.toLocaleString()} 분
                  </p>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                    진행률
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">
                    {progress.toFixed(2)} %
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function LeavingOfficePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LeavingOfficePageContent />
    </Suspense>
  );
}
