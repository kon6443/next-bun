'use client';

import { useState, useEffect } from 'react';
import type { CaughtFish, FishGrade } from '../types/fish';
import { GRADE_COLORS, GRADE_NAMES } from '../config/constants';
import { formatWeight } from '../utils/format';

interface FishResultModalProps {
  type: 'success' | 'fail';
  fish: CaughtFish | null;
  onDismiss: () => void;
}

// ─── 등급별 설정 ──────────────────────────────────────────

interface GradeEffect {
  /** 배경 오버레이 */
  backdrop: string;
  /** 카드 box-shadow */
  glow: string;
  /** 카드 테두리 색상 */
  border: string;
  /** 파티클 개수 */
  particleCount: number;
  /** 화면 흔들림 강도 (px, 0=없음) */
  shakeIntensity: number;
  /** 카드 진입 애니메이션 클래스 */
  entrance: string;
  /** 빛줄기 표시 */
  rays: boolean;
  /** 홀로그래픽 효과 */
  holographic: boolean;
  /** 전체 화면 플래시 */
  flash: boolean;
  /** 결과 공개 지연 (ms) */
  revealDelay: number;
}

const GRADE_EFFECTS: Record<FishGrade, GradeEffect> = {
  common: {
    backdrop: 'bg-black/40',
    glow: 'none',
    border: 'rgba(156,163,175,0.3)',
    particleCount: 0,
    shakeIntensity: 0,
    entrance: 'animate-fadeIn',
    rays: false,
    holographic: false,
    flash: false,
    revealDelay: 0,
  },
  uncommon: {
    backdrop: 'bg-black/45',
    glow: '0 0 20px rgba(74,222,128,0.2)',
    border: 'rgba(74,222,128,0.4)',
    particleCount: 3,
    shakeIntensity: 0,
    entrance: 'animate-scaleIn',
    rays: false,
    holographic: false,
    flash: false,
    revealDelay: 0,
  },
  rare: {
    backdrop: 'bg-black/50',
    glow: '0 0 30px rgba(96,165,250,0.3), 0 0 60px rgba(96,165,250,0.1)',
    border: 'rgba(96,165,250,0.5)',
    particleCount: 8,
    shakeIntensity: 2,
    entrance: 'animate-bounceIn',
    rays: false,
    holographic: false,
    flash: false,
    revealDelay: 0,
  },
  epic: {
    backdrop: 'bg-black/55',
    glow: '0 0 40px rgba(192,132,252,0.4), 0 0 80px rgba(192,132,252,0.15)',
    border: 'rgba(192,132,252,0.6)',
    particleCount: 14,
    shakeIntensity: 4,
    entrance: 'animate-epicIn',
    rays: true,
    holographic: true,
    flash: false,
    revealDelay: 200,
  },
  legendary: {
    backdrop: 'bg-black/60',
    glow: '0 0 50px rgba(251,191,36,0.5), 0 0 100px rgba(251,191,36,0.2), 0 0 150px rgba(251,191,36,0.1)',
    border: 'rgba(251,191,36,0.7)',
    particleCount: 28,
    shakeIntensity: 6,
    entrance: 'animate-legendaryIn',
    rays: true,
    holographic: true,
    flash: true,
    revealDelay: 800,
  },
};

// ─── 메인 컴포넌트 ──────────────────────────────────────────

export default function FishResultModal({ type, fish, onDismiss }: FishResultModalProps) {
  const [revealed, setRevealed] = useState(false);
  const [flashVisible, setFlashVisible] = useState(false);

  const grade = fish?.grade ?? 'common';
  const fx = GRADE_EFFECTS[grade];

  // 전설 등급: 플래시 → 지연 → 공개
  useEffect(() => {
    if (type !== 'success' || !fish) return;

    if (fx.flash) {
      setFlashVisible(true);
      const flashTimer = setTimeout(() => setFlashVisible(false), 400);
      const revealTimer = setTimeout(() => setRevealed(true), fx.revealDelay);
      return () => { clearTimeout(flashTimer); clearTimeout(revealTimer); };
    } else if (fx.revealDelay > 0) {
      const timer = setTimeout(() => setRevealed(true), fx.revealDelay);
      return () => clearTimeout(timer);
    } else {
      setRevealed(true);
    }
  }, [type, fish, fx.flash, fx.revealDelay]);

  // 화면 흔들림
  useEffect(() => {
    if (type !== 'success' || fx.shakeIntensity === 0) return;
    const el = document.getElementById('fishing-shake-root');
    if (!el) return;

    const intensity = fx.shakeIntensity;
    let frame = 0;
    const totalFrames = grade === 'legendary' ? 20 : 12;

    const shake = () => {
      if (frame >= totalFrames) {
        el.style.transform = '';
        return;
      }
      const x = (Math.random() - 0.5) * intensity * 2;
      const y = (Math.random() - 0.5) * intensity * 2;
      const decay = 1 - frame / totalFrames;
      el.style.transform = `translate(${x * decay}px, ${y * decay}px)`;
      frame++;
      requestAnimationFrame(shake);
    };

    // 전설: 플래시 후 흔들림, 나머지: 즉시
    const delay = fx.flash ? 300 : 0;
    const timer = setTimeout(() => requestAnimationFrame(shake), delay);
    return () => { clearTimeout(timer); el.style.transform = ''; };
  }, [type, fx.shakeIntensity, fx.flash, grade]);

  // ─── 실패 모달 ──────────────────────────────────────
  if (type === 'fail') {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-auto">
        <div className="absolute inset-0 bg-black/40" onClick={onDismiss} />
        <div className="relative bg-slate-900/95 border border-slate-700/50 rounded-2xl p-6 mx-6 max-w-xs w-full text-center animate-fadeIn">
          <p className="text-4xl mb-3">💨</p>
          <p className="text-slate-300 text-lg font-bold mb-1">물고기가 도망갔습니다!</p>
          <p className="text-slate-400 text-sm mb-4">다음엔 꼭 잡아봅시다...</p>
          <button
            onClick={onDismiss}
            className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    );
  }

  if (!fish) return null;

  const gradeColor = GRADE_COLORS[fish.grade];
  const gradeName = GRADE_NAMES[fish.grade];

  return (
    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-auto">
      {/* 전체 화면 플래시 (전설) */}
      {flashVisible && (
        <div className="absolute inset-0 z-30 animate-flash" style={{ background: gradeColor }} />
      )}

      {/* 배경 */}
      <div className={`absolute inset-0 ${fx.backdrop}`} onClick={onDismiss} />

      {/* 빛줄기 (epic, legendary) */}
      {fx.rays && revealed && <Rays color={gradeColor} grade={grade} />}

      {/* 파티클 */}
      {revealed && fx.particleCount > 0 && (
        <Particles count={fx.particleCount} color={gradeColor} grade={grade} />
      )}

      {/* 대기 중 텍스트 (전설 지연 공개) */}
      {!revealed && fx.revealDelay > 0 && (
        <div className="relative z-10 text-center animate-pulse">
          <p className="text-2xl font-bold" style={{ color: gradeColor }}>...!</p>
        </div>
      )}

      {/* 결과 카드 */}
      {revealed && (
        <div
          className={`relative z-10 rounded-2xl p-6 mx-6 max-w-xs w-full text-center ${fx.entrance}`}
          style={{
            background: fx.holographic
              ? `linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.85))`
              : 'rgba(15,23,42,0.95)',
            borderWidth: '1.5px',
            borderStyle: 'solid',
            borderColor: fx.border,
            boxShadow: fx.glow,
          }}
        >
          {/* 홀로그래픽 오버레이 */}
          {fx.holographic && (
            <div
              className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none"
              style={{ opacity: 0.15 }}
            >
              <div className="absolute inset-0 animate-holoShift" style={{
                background: `linear-gradient(135deg,
                  transparent 0%, ${gradeColor}40 25%, transparent 50%,
                  ${gradeColor}30 75%, transparent 100%)`,
                backgroundSize: '200% 200%',
              }} />
            </div>
          )}

          {/* 등급 뱃지 */}
          <div
            className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-3 ${
              grade === 'legendary' ? 'animate-badgePulse' : ''
            }`}
            style={{ backgroundColor: `${gradeColor}25`, color: gradeColor }}
          >
            {gradeName}
          </div>

          {/* 물고기 아이콘 */}
          <p className={`text-5xl mb-2 ${grade === 'legendary' ? 'animate-fishBounce' : grade === 'epic' ? 'animate-fishPop' : ''}`}>
            🐟
          </p>

          {/* 물고기 이름 */}
          <h3
            className={`text-xl font-bold mb-3 ${grade === 'legendary' ? 'animate-textGlow' : ''}`}
            style={{ color: gradeColor }}
          >
            {fish.name}
          </h3>

          {/* 스탯 */}
          <div className="flex justify-center gap-6 mb-4">
            <div>
              <p className="text-xs text-slate-400">크기</p>
              <p className="text-lg font-bold text-slate-200">{fish.size}cm</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">무게</p>
              <p className="text-lg font-bold text-slate-200">{formatWeight(fish.weight)}</p>
            </div>
          </div>

          <button
            onClick={onDismiss}
            className="text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
            style={{
              backgroundColor: `${gradeColor}90`,
            }}
          >
            확인
          </button>
        </div>
      )}

      {/* 애니메이션 CSS */}
      <style>{EFFECT_STYLES}</style>
    </div>
  );
}

// ─── 파티클 컴포넌트 ──────────────────────────────────────

function Particles({ count, color, grade }: { count: number; color: string; grade: FishGrade }) {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * 360;
        const distance = 60 + Math.random() * 100;
        const size = grade === 'legendary' ? 4 + Math.random() * 6 : 2 + Math.random() * 4;
        const delay = Math.random() * 0.3;
        const duration = 0.8 + Math.random() * 0.6;
        const isStar = grade === 'legendary' && i % 3 === 0;

        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 animate-particleBurst"
            style={{
              width: size,
              height: size,
              borderRadius: isStar ? '2px' : '50%',
              backgroundColor: color,
              boxShadow: `0 0 ${size * 2}px ${color}`,
              transform: `rotate(${angle}deg) translateY(-${distance}px)`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              opacity: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── 빛줄기 컴포넌트 ──────────────────────────────────────

function Rays({ color, grade }: { color: string; grade: FishGrade }) {
  const rayCount = grade === 'legendary' ? 12 : 6;
  const opacity = grade === 'legendary' ? 0.2 : 0.1;

  return (
    <div className="absolute inset-0 z-5 pointer-events-none overflow-hidden flex items-center justify-center">
      <div className="animate-raysSpin" style={{ width: '150%', height: '150%' }}>
        {Array.from({ length: rayCount }, (_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 origin-bottom"
            style={{
              width: '2px',
              height: '50%',
              background: `linear-gradient(to top, ${color}, transparent)`,
              opacity,
              transform: `rotate(${(i / rayCount) * 360}deg) translateX(-50%)`,
              transformOrigin: '50% 100%',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── CSS 애니메이션 ──────────────────────────────────────

const EFFECT_STYLES = `
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.8); }
  60% { transform: scale(1.03); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes bounceIn {
  from { opacity: 0; transform: scale(0.5) translateY(20px); }
  50% { transform: scale(1.08) translateY(-5px); }
  70% { transform: scale(0.97); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes epicIn {
  from { opacity: 0; transform: scale(0.3) rotate(-5deg); }
  40% { transform: scale(1.12) rotate(2deg); }
  60% { transform: scale(0.95) rotate(-1deg); }
  80% { transform: scale(1.03); }
  to { opacity: 1; transform: scale(1) rotate(0deg); }
}
@keyframes legendaryIn {
  from { opacity: 0; transform: scale(0.1); }
  30% { opacity: 1; transform: scale(1.2); }
  50% { transform: scale(0.9); }
  65% { transform: scale(1.1); }
  80% { transform: scale(0.97); }
  to { transform: scale(1); }
}
@keyframes flash {
  0% { opacity: 0; }
  20% { opacity: 0.9; }
  100% { opacity: 0; }
}
@keyframes particleBurst {
  0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.3) translateY(-40px); }
}
@keyframes holoShift {
  0% { background-position: 0% 0%; }
  50% { background-position: 100% 100%; }
  100% { background-position: 0% 0%; }
}
@keyframes raysSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}
@keyframes fishBounce {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-8px) rotate(-5deg); }
  75% { transform: translateY(-4px) rotate(5deg); }
}
@keyframes fishPop {
  from { transform: scale(0.5); }
  50% { transform: scale(1.2); }
  to { transform: scale(1); }
}
@keyframes textGlow {
  0%, 100% { text-shadow: 0 0 8px currentColor; }
  50% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
}

.animate-fadeIn { animation: fadeIn 0.3s ease-out both; }
.animate-scaleIn { animation: scaleIn 0.4s ease-out both; }
.animate-bounceIn { animation: bounceIn 0.5s ease-out both; }
.animate-epicIn { animation: epicIn 0.6s ease-out both; }
.animate-legendaryIn { animation: legendaryIn 0.8s ease-out both; }
.animate-flash { animation: flash 0.4s ease-out both; }
.animate-particleBurst { animation: particleBurst 1s ease-out both; }
.animate-holoShift { animation: holoShift 3s ease-in-out infinite; }
.animate-raysSpin { animation: raysSpin 8s linear infinite; }
.animate-badgePulse { animation: badgePulse 1.5s ease-in-out infinite; }
.animate-fishBounce { animation: fishBounce 2s ease-in-out infinite; }
.animate-fishPop { animation: fishPop 0.4s ease-out both; }
.animate-textGlow { animation: textGlow 2s ease-in-out infinite; }
`;
