"use client";

import { useState, useEffect } from "react";

// 남은 시간을 시, 분, 초 등 다양한 형식으로 저장하기 위한 인터페이스
interface TimeLeft {
  totalSeconds: number;
  totalMinutes: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export default function LeavingOfficePage() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [isTimeToGoHome, setIsTimeToGoHome] = useState(false);

  useEffect(() => {
    const calculateRemainingTime = () => {
      const now = new Date();

      // 한국 시간(KST, UTC+9)으로 오후 6시 목표 시간 설정
      const targetTime = new Date();
      targetTime.setUTCHours(18 - 9, 0, 0, 0); // 18:00 KST = 09:00 UTC

      // 현재 시간이 목표 시간을 이미 지났는지 확인
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

    calculateRemainingTime(); // 초기 렌더링 시 한 번 실행
    const intervalId = setInterval(calculateRemainingTime, 1000); // 1초마다 시간 갱신

    return () => clearInterval(intervalId); // 컴포넌트 언마운트 시 인터벌 정리
  }, []);

  const formatTime = (num: number) => num.toString().padStart(2, "0");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold mb-8">남은 시간</h1>
        {isTimeToGoHome ? (
          <div className="text-4xl text-green-400 font-bold">
            🎉 퇴근 시간입니다! 🎉
          </div>
        ) : timeLeft ? (
          <div className="space-y-6">
            <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
              <p className="text-lg text-gray-400">시간, 분, 초</p>
              <p className="text-6xl font-mono tracking-widest">
                {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:
                {formatTime(timeLeft.seconds)}
              </p>
            </div>
            <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
              <p className="text-lg text-gray-400">총 분</p>
              <p className="text-4xl font-mono">
                약 {timeLeft.totalMinutes.toLocaleString()} 분
              </p>
            </div>
            <div className="p-6 bg-gray-800 rounded-lg shadow-lg">
              <p className="text-lg text-gray-400">총 초</p>
              <p className="text-4xl font-mono">
                {timeLeft.totalSeconds.toLocaleString()} 초
              </p>
            </div>
          </div>
        ) : (
          <p className="text-2xl">시간을 계산하고 있습니다...</p>
        )}
      </div>
    </main>
  );
}
