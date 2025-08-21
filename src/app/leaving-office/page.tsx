"use client";

import { useState, useEffect } from "react";
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

export default function LeavingOfficePage() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [isTimeToGoHome, setIsTimeToGoHome] = useState(false);
  const [progress, setProgress] = useState(0);
  const [animationType, setAnimationType] = useState<AnimationType>("sun");

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();

      const startTime = new Date();
      startTime.setHours(9, 0, 0, 0);

      const targetTime = new Date();
      targetTime.setHours(18, 0, 0, 0);

      const totalWorkSeconds = targetTime.getTime() - startTime.getTime();
      const elapsedSeconds = now.getTime() - startTime.getTime();

      let currentProgress = (elapsedSeconds / totalWorkSeconds) * 100;
      if (currentProgress < 0) currentProgress = 0;
      if (currentProgress > 100) currentProgress = 100;

      setProgress(currentProgress);

      if (now.getTime() >= targetTime.getTime()) {
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
      const difference = targetTime.getTime() - now.getTime();
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
  }, []);

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
