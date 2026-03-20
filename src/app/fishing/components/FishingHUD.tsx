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
  onStartFishing: () => void;
  onBiteTap: () => void;
  onChallengeTap: () => void;
  onCancel: () => void;
  onOpenInventory: () => void;
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
  onStartFishing,
  onBiteTap,
  onChallengeTap,
  onCancel,
  onOpenInventory,
}: FishingHUDProps) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
      {/* 맵 이름 (우측 상단, 나가기 버튼과 겹치지 않도록) */}
      <div className="absolute top-3 right-3">
        <div className="bg-slate-900/70 rounded-xl px-3 py-1.5 border border-slate-700/50">
          <span className="text-xs text-slate-300">{mapName}</span>
        </div>
      </div>

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

      {/* 하단 인벤토리 버튼 */}
      {(fishingState === 'idle' || fishingState === 'waiting') && (
        <div className="absolute bottom-6 right-4 pointer-events-auto">
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

// ─── 하위 컴포넌트 (상태별 UI 분리) ─────────────────────

function StartFishingButton({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
      <button
        onClick={onStart}
        className="bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold
                   px-6 py-3 rounded-2xl shadow-lg shadow-blue-900/50
                   border border-blue-400/30 transition-all text-sm"
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
            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
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
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
      <button
        onClick={onTap}
        className="relative w-40 h-40 rounded-full bg-red-600/90 active:scale-90
                   border-4 border-red-400 shadow-2xl shadow-red-900/80
                   flex flex-col items-center justify-center transition-transform
                   animate-bounce"
      >
        <span className="text-3xl">🐟</span>
        <span className="text-white font-bold text-lg mt-1">입질!</span>
        <div className="absolute -bottom-8 w-32 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 rounded-full"
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
        <div className="w-64 h-10 bg-slate-800 rounded-xl border border-slate-600 relative overflow-hidden">
          <div
            className="absolute top-0 h-full bg-green-500/40 border-x border-green-400"
            style={{
              left: `${zone[0] * 100}%`,
              width: `${(zone[1] - zone[0]) * 100}%`,
            }}
          />
          <div
            className="absolute top-0 h-full w-1.5 bg-yellow-400 rounded-full shadow-lg shadow-yellow-500/50"
            style={{ left: `${gauge * 100}%` }}
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
