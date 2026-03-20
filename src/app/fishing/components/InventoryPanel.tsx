'use client';

import { useState } from 'react';
import type { CaughtFish } from '../types/fish';
import { GRADE_COLORS, GRADE_NAMES } from '../config/constants';
import { formatWeight } from '../utils/format';

interface InventoryPanelProps {
  inventory: CaughtFish[];
  isOpen: boolean;
  onClose: () => void;
}

export default function InventoryPanel({ inventory, isOpen, onClose }: InventoryPanelProps) {
  const [selectedFish, setSelectedFish] = useState<CaughtFish | null>(null);

  if (!isOpen) return null;

  const sorted = [...inventory].sort((a, b) => b.caughtAt - a.caughtAt);

  return (
    <div className="absolute inset-0 z-30 pointer-events-auto">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-700/50 rounded-t-2xl"
        style={{
          maxHeight: '60vh',
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-slate-200 font-bold text-base">
            🎒 보관함 ({inventory.length})
          </h2>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 text-lg"
          >
            ✕
          </button>
        </div>

        {/* 물고기 목록 */}
        <div className="p-3 overflow-y-auto" style={{ maxHeight: 'calc(60vh - 56px)' }}>
          {inventory.length === 0 ? (
            <p className="text-center text-slate-600 py-8 text-sm">
              아직 잡은 물고기가 없습니다
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {sorted.map((fish) => {
                const color = GRADE_COLORS[fish.grade];
                const isSelected = selectedFish?.id === fish.id;

                return (
                  <button
                    key={fish.id}
                    onClick={() => setSelectedFish(isSelected ? null : fish)}
                    className="relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all active:scale-95"
                    style={{
                      backgroundColor: `${color}15`,
                      border: `1.5px solid ${isSelected ? color : `${color}40`}`,
                      boxShadow: isSelected ? `0 0 12px ${color}30` : 'none',
                    }}
                  >
                    <span className="text-xl">🐟</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 truncate w-full px-1 text-center">
                      {fish.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 선택된 물고기 상세 */}
          {selectedFish && (
            <div
              className="mt-3 p-3 rounded-xl border"
              style={{
                backgroundColor: `${GRADE_COLORS[selectedFish.grade]}10`,
                borderColor: `${GRADE_COLORS[selectedFish.grade]}30`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{
                    backgroundColor: `${GRADE_COLORS[selectedFish.grade]}25`,
                    color: GRADE_COLORS[selectedFish.grade],
                  }}
                >
                  {GRADE_NAMES[selectedFish.grade]}
                </span>
                <span className="text-sm font-bold text-slate-200">
                  {selectedFish.name}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-slate-400">
                <span>크기: {selectedFish.size}cm</span>
                <span>무게: {formatWeight(selectedFish.weight)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
