"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import SunMoonAnimation from "./components/SunMoonAnimation";
import HourglassAnimation from "./components/HourglassAnimation";
import BatteryAnimation from "./components/BatteryAnimation";
import WindowAnimation from "./components/WindowAnimation";

// 남은 시간을 시, 분, 초 등 다양한 형식으로 저장하기 위한 인터페이스
interface TimeLeft {
  totalSeconds: number;
  totalMinutes: number;
  hours: number;
  minutes: number;
  seconds: number;
}

type AnimationType = "sun" | "hourglass" | "battery" | "window";

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
  const [animationType, setAnimationType] = useState<AnimationType>("sun");
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

  const renderAnimation = () => {
    switch (animationType) {
      case "sun":
        return <SunMoonAnimation progress={progress} />;
      case "hourglass":
        return <HourglassAnimation progress={progress} />;
      case "battery":
        return <BatteryAnimation progress={progress} />;
      case "window":
        return <WindowAnimation progress={progress} />;
      default:
        return null;
    }
  };

  const buttonStyle = "px-4 py-2 rounded-lg transition-colors duration-200";
  const activeButtonStyle = "bg-blue-600 text-white";
  const inactiveButtonStyle = "bg-gray-700 hover:bg-gray-600";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 sm:p-24 bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-4">남은 시간</h1>

        <div className="my-8 h-52 flex items-center justify-center">
          {isTimeToGoHome ? (
            <div className="text-4xl text-green-400 font-bold">
              🎉 퇴근 시간입니다! 🎉
            </div>
          ) : (
            renderAnimation()
          )}
        </div>

        <div className="flex justify-center space-x-2 mb-8">
          <button
            onClick={() => setAnimationType("sun")}
            className={`${buttonStyle} ${
              animationType === "sun" ? activeButtonStyle : inactiveButtonStyle
            }`}
          >
            태양과 달
          </button>
          <button
            onClick={() => setAnimationType("hourglass")}
            className={`${buttonStyle} ${
              animationType === "hourglass"
                ? activeButtonStyle
                : inactiveButtonStyle
            }`}
          >
            모래시계
          </button>
          <button
            onClick={() => setAnimationType("battery")}
            className={`${buttonStyle} ${
              animationType === "battery"
                ? activeButtonStyle
                : inactiveButtonStyle
            }`}
          >
            배터리
          </button>
          <button
            onClick={() => setAnimationType("window")}
            className={`${buttonStyle} ${
              animationType === "window"
                ? activeButtonStyle
                : inactiveButtonStyle
            }`}
          >
            창문
          </button>
        </div>

        <div className="flex justify-center items-center space-x-4 my-8">
          <div>
            <label htmlFor="startTime" className="block text-sm font-medium text-gray-400 mb-1">
              시작 시간
            </label>
            <input
              type="time"
              id="startTime"
              value={startTime}
              onChange={(e) => handleTimeChange("start", e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-md p-2 text-white"
            />
          </div>
          <div>
            <label htmlFor="endTime" className="block text-sm font-medium text-gray-400 mb-1">
              종료 시간
            </label>
            <input
              type="time"
              id="endTime"
              value={endTime}
              onChange={(e) => handleTimeChange("end", e.target.value)}
              className="bg-gray-800 border border-gray-600 rounded-md p-2 text-white"
            />
          </div>
        </div>

        {timeLeft && !isTimeToGoHome && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
              <p className="text-lg text-gray-400">남은 시간 (HH:MM:SS)</p>
              <p className="text-5xl font-mono tracking-widest">
                {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:
                {formatTime(timeLeft.seconds)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <p className="text-md text-gray-400">총 분</p>
                <p className="text-2xl font-mono">
                  {timeLeft.totalMinutes.toLocaleString()} 분
                </p>
              </div>
              <div className="p-4 bg-gray-800 rounded-lg shadow-lg">
                <p className="text-md text-gray-400">업무 진행률</p>
                <p className="text-2xl font-mono">{progress.toFixed(2)} %</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function LeavingOfficePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LeavingOfficePageContent />
    </Suspense>
  );
}
