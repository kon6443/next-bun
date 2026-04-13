'use client';

import type { FishingState, FishingPoint } from '../types/game';
import type { Fish } from '../types/fish';
import { GRADE_COLORS, GRADE_NAMES } from '../config/constants';

interface FishingHUDProps {
  fishingState: FishingState;
  mapName: string;
  nearbyPoint: FishingPoint | null;
  currentFish: Fish | null;
  waitProgress: number;
  biteTimeLeft: number;
  challengeGauge: number;
  challengeZone: [number, number];
  inventoryCount: number;
  onlineCount: number;
  isConnected: boolean;
  onStartFishing: () => void;
  onBiteTap: () => void;
  onChallengeTap: () => void;
  onCancel: () => void;
  onOpenInventory: () => void;
  onToggleChat: () => void;
}

export default function FishingHUD({
  fishingState,
  mapName,
  nearbyPoint,
  currentFish,
  waitProgress,
  biteTimeLeft,
  challengeGauge,
  challengeZone,
  inventoryCount,
  onlineCount,
  isConnected,
  onStartFishing,
  onBiteTap,
  onChallengeTap,
  onCancel,
  onOpenInventory,
  onToggleChat,
}: FishingHUDProps) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {/* 맵 이름 + 온라인 유저 수 (우측 상단) */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
        <div className="bg-slate-900/70 rounded-xl px-3 py-1.5 border border-slate-700/50">
          <span className="text-xs text-slate-300">{mapName}</span>
        </div>
        {isConnected && (
          <div className="bg-slate-900/70 rounded-xl px-3 py-1.5 border border-slate-700/50 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-slate-400">{onlineCount}명 접속 중</span>
          </div>
        )}
      </div>

      {/* PC 키보드 힌트 (터치 미지원 기기에서만 표시) */}
      <KeyboardHint fishingState={fishingState} hasNearbyPoint={!!nearbyPoint} />

      {/* 상태별 UI */}
      {fishingState === 'idle' && nearbyPoint && (
        <StartFishingButton onStart={onStartFishing} />
      )}
      {fishingState === 'casting' && <CastingIndicator />}
      {fishingState === 'waiting' && (
        <WaitingIndicator progress={waitProgress} onCancel={onCancel} />
      )}
      {fishingState === 'bite' && (
        <BiteButton biteTimeLeft={biteTimeLeft} onTap={onBiteTap} />
      )}
      {fishingState === 'challenge' && (
        <ChallengeUI
          fish={currentFish}
          gauge={challengeGauge}
          zone={challengeZone}
          onTap={onChallengeTap}
        />
      )}

      {/* 하단 버튼 그룹 */}
      {(fishingState === 'idle' || fishingState === 'waiting') && (
        <div
          className="absolute right-4 flex flex-col gap-2 pointer-events-auto"
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            onClick={onToggleChat}
            className="bg-slate-800/80 border border-slate-600/50 rounded-xl
                       px-4 py-2.5 text-slate-300 text-sm active:scale-95 transition-transform"
          >
            💬 채팅
          </button>
          <button
            onClick={onOpenInventory}
            className="relative bg-slate-800/80 border border-slate-600/50 rounded-xl
                       px-4 py-2.5 text-slate-300 text-sm active:scale-95 transition-transform"
          >
            🎒 보관함
            {inventoryCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-cyan-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                {inventoryCount > 99 ? '99+' : inventoryCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 키보드 힌트 (PC 전용) ───────────────────────────────

function KeyboardHint({ fishingState, hasNearbyPoint }: { fishingState: FishingState; hasNearbyPoint: boolean }) {
  // 터치 디바이스 감지 (간단한 휴리스틱)
  if (typeof window !== 'undefined' && 'ontouchstart' in window) return null;

  let hint = '';
  switch (fishingState) {
    case 'idle':
      hint = hasNearbyPoint
        ? 'WASD 이동 · Space 낚시 · Enter 채팅'
        : 'WASD 이동 · Enter 채팅';
      break;
    case 'waiting':
      hint = 'Space 취소';
      break;
    case 'bite':
      hint = 'Space 챌린지!';
      break;
    case 'challenge':
      hint = 'Space 잡기!';
      break;
    case 'success':
    case 'fail':
      hint = 'Space 확인';
      break;
    default:
      return null;
  }

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2"
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="bg-slate-900/60 rounded-lg px-3 py-1 border border-slate-700/30">
        <span className="text-[10px] text-slate-400">{hint}</span>
      </div>
    </div>
  );
}

// ─── 하위 컴포넌트 (상태별 UI 분리) ─────────────────────

function StartFishingButton({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
      <button
        onClick={onStart}
        className="bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-bold
                   px-6 py-3 rounded-2xl shadow-lg shadow-sky-900/50
                   border border-sky-400/30 transition-all text-sm"
      >
        🎣 낚시 시작
      </button>
    </div>
  );
}

function CastingIndicator() {
  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none">
      <div className="bg-slate-900/80 rounded-xl px-4 py-3 border border-slate-700/50">
        <p className="text-sm text-cyan-400 animate-pulse">캐스팅 중...</p>
      </div>
    </div>
  );
}

function WaitingIndicator({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-48 pointer-events-auto">
      <div className="bg-slate-900/80 rounded-xl px-4 py-3 border border-slate-700/50 text-center">
        <p className="text-xs text-slate-400 mb-2">입질 대기 중...</p>
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <button
          onClick={onCancel}
          className="mt-2 text-xs text-slate-500 hover:text-slate-300"
        >
          취소
        </button>
      </div>
    </div>
  );
}

function BiteButton({ biteTimeLeft, onTap }: { biteTimeLeft: number; onTap: () => void }) {
  // 시간에 따른 긴박감: 여유(>50%) → 주의(20~50%) → 위급(<20%)
  const urgent = biteTimeLeft < 0.2;
  const warning = biteTimeLeft < 0.5;

  const bgColor = urgent ? 'bg-red-700/95' : warning ? 'bg-red-600/95' : 'bg-red-600/90';
  const borderColor = urgent ? 'border-red-300' : 'border-red-400';
  const barColor = urgent ? 'bg-red-400' : warning ? 'bg-orange-400' : 'bg-green-400';
  const shadowStyle = urgent
    ? { boxShadow: '0 0 40px rgba(239, 68, 68, 0.6)' }
    : {};

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
      <button
        onClick={onTap}
        className={`relative w-40 h-40 rounded-full ${bgColor} active:scale-90
                   border-4 ${borderColor} shadow-2xl shadow-red-900/80
                   flex flex-col items-center justify-center transition-all
                   animate-bounce`}
        style={shadowStyle}
      >
        <span className="text-3xl">🐟</span>
        <span className="text-white font-bold text-lg mt-1">입질!</span>
        <div className="absolute -bottom-8 w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-colors`}
            style={{ width: `${biteTimeLeft * 100}%` }}
          />
        </div>
      </button>
    </div>
  );
}

function ChallengeUI({
  fish,
  gauge,
  zone,
  onTap,
}: {
  fish: Fish | null;
  gauge: number;
  zone: [number, number];
  onTap: () => void;
}) {
  const inZone = gauge >= zone[0] && gauge <= zone[1];

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
      <div className="flex flex-col items-center gap-4">
        {fish && (
          <div className="bg-slate-900/80 rounded-xl px-3 py-1.5 border border-slate-700/50">
            <span
              className="text-sm font-bold"
              style={{ color: GRADE_COLORS[fish.grade] }}
            >
              [{GRADE_NAMES[fish.grade]}] {fish.name}
            </span>
          </div>
        )}

        {/* 타이밍 바 */}
        <div
          className="w-64 h-10 bg-slate-800 rounded-xl border relative overflow-hidden transition-colors"
          style={{
            borderColor: inZone ? 'rgb(74, 222, 128)' : 'rgb(71, 85, 105)',
            boxShadow: inZone ? '0 0 16px rgba(74, 222, 128, 0.3)' : 'none',
          }}
        >
          <div
            className="absolute top-0 h-full border-x transition-colors"
            style={{
              left: `${zone[0] * 100}%`,
              width: `${(zone[1] - zone[0]) * 100}%`,
              backgroundColor: inZone ? 'rgba(74, 222, 128, 0.5)' : 'rgba(74, 222, 128, 0.25)',
              borderColor: inZone ? 'rgb(74, 222, 128)' : 'rgb(34, 197, 94)',
            }}
          />
          <div
            className="absolute top-0 h-full w-1.5 rounded-full shadow-lg transition-colors"
            style={{
              left: `${gauge * 100}%`,
              backgroundColor: inZone ? 'rgb(74, 222, 128)' : 'rgb(250, 204, 21)',
              boxShadow: inZone
                ? '0 0 8px rgba(74, 222, 128, 0.8)'
                : '0 0 8px rgba(250, 204, 21, 0.5)',
            }}
          />
        </div>

        <button
          onClick={onTap}
          className="bg-green-600 hover:bg-green-500 active:scale-90 text-white font-bold
                     px-8 py-4 rounded-2xl shadow-lg shadow-green-900/50
                     border border-green-400/30 transition-all text-lg"
        >
          잡기!
        </button>
      </div>
    </div>
  );
}
