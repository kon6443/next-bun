'use client';

import { useEffect, useId, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
import { EyeDropperIcon, CheckIcon } from '@/app/components/Icons';
import { RECOMMENDED_TAG_COLORS, normalizeHexColor } from '@/app/utils/tagUtils';

/**
 * 브라우저 EyeDropper API — Chromium 데스크톱만 지원한다(Safari·Firefox·모바일 미지원).
 * TypeScript lib.dom에 아직 타입이 없어 쓰는 부분만 선언한다.
 */
type EyeDropperConstructor = new () => { open: () => Promise<{ sRGBHex: string }> };

function getEyeDropper(): EyeDropperConstructor | null {
  if (typeof window === 'undefined' || !('EyeDropper' in window)) return null;
  return (window as Window & { EyeDropper: EyeDropperConstructor }).EyeDropper;
}

type TagColorPickerProps = {
  /** #RRGGBB 대문자 */
  value: string;
  onChange: (color: string) => void;
};

/**
 * 태그 색 선택 — 추천 5색 + react-colorful 피커 + HEX 입력 + 스포이드(지원 브라우저만)
 * onChange에는 항상 #RRGGBB 대문자를 넘긴다 (서버 저장 형식)
 */
export function TagColorPicker({ value, onChange }: TagColorPickerProps) {
  const hexInputId = useId();
  // 서버 렌더와 첫 렌더를 맞추려고 마운트 후에 감지한다
  const [EyeDropper, setEyeDropper] = useState<EyeDropperConstructor | null>(null);
  useEffect(() => {
    setEyeDropper(() => getEyeDropper());
  }, []);

  const emit = (color: string) => {
    const normalized = normalizeHexColor(color);
    if (normalized) onChange(normalized);
  };

  const handleEyeDropper = async () => {
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      emit(result.sRGBHex);
    } catch {
      // 사용자가 Esc로 취소하면 reject된다 — 무시
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="추천 색">
        {RECOMMENDED_TAG_COLORS.map(color => {
          const selected = value === color;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              aria-label={`추천 색 ${color}`}
              aria-pressed={selected}
              className="flex h-11 w-11 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full ${selected ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`}
                style={{ backgroundColor: color }}
              >
                {selected && <CheckIcon className="h-4 w-4 text-slate-900" />}
              </span>
            </button>
          );
        })}
      </div>

      <HexColorPicker color={value} onChange={emit} style={{ width: '100%', height: 160 }} />

      <div className="flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-lg border border-white/10" style={{ backgroundColor: value }} aria-hidden="true" />
        <label htmlFor={hexInputId} className="sr-only">
          색상 코드 (HEX)
        </label>
        <HexColorInput
          id={hexInputId}
          color={value}
          onChange={emit}
          prefixed
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 font-mono text-base uppercase text-slate-200 focus:border-white/20 focus:outline-none"
        />
        {EyeDropper && (
          <button
            type="button"
            onClick={handleEyeDropper}
            aria-label="화면에서 색 가져오기 (스포이드)"
            title="스포이드"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <EyeDropperIcon className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
