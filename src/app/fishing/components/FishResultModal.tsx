'use client';

import type { CaughtFish, FishGrade } from '../types/fish';
import { GRADE_COLORS, GRADE_NAMES } from '../config/constants';
import { formatWeight } from '../utils/format';

interface FishResultModalProps {
  type: 'success' | 'fail';
  fish: CaughtFish | null;
  onDismiss: () => void;
}

function gradeGlow(grade: FishGrade): string {
  const color = GRADE_COLORS[grade];
  if (grade === 'legendary') return `0 0 30px ${color}, 0 0 60px ${color}40`;
  if (grade === 'epic') return `0 0 20px ${color}80`;
  if (grade === 'rare') return `0 0 15px ${color}60`;
  return 'none';
}

export default function FishResultModal({ type, fish, onDismiss }: FishResultModalProps) {
  if (type === 'fail') {
    return (
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-auto">
        <div className="absolute inset-0 bg-black/40" onClick={onDismiss} />
        <div className="relative bg-slate-900/95 border border-slate-700/50 rounded-2xl p-6 mx-6 max-w-xs w-full text-center">
          <p className="text-4xl mb-3">💨</p>
          <p className="text-slate-300 text-lg font-bold mb-1">물고기가 도망갔습니다!</p>
          <p className="text-slate-500 text-sm mb-4">다음엔 꼭 잡아봅시다...</p>
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
      <div className="absolute inset-0 bg-black/50" onClick={onDismiss} />
      <div
        className="relative bg-slate-900/95 border rounded-2xl p-6 mx-6 max-w-xs w-full text-center"
        style={{
          borderColor: `${gradeColor}60`,
          boxShadow: gradeGlow(fish.grade),
        }}
      >
        <div
          className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ backgroundColor: `${gradeColor}25`, color: gradeColor }}
        >
          {gradeName}
        </div>

        <p className="text-5xl mb-2">🐟</p>

        <h3 className="text-xl font-bold mb-3" style={{ color: gradeColor }}>
          {fish.name}
        </h3>

        <div className="flex justify-center gap-6 mb-4">
          <div>
            <p className="text-xs text-slate-500">크기</p>
            <p className="text-lg font-bold text-slate-200">{fish.size}cm</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">무게</p>
            <p className="text-lg font-bold text-slate-200">{formatWeight(fish.weight)}</p>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          확인
        </button>
      </div>
    </div>
  );
}
