"use client";

import { useEffect, useRef } from "react";
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from "@/types/tetrisBattleSocket";
import { CELL_COLORS } from "../../lib/blockSprites";
import { useReducedEffects } from "../../hooks/useReducedEffects";
import fx from "./battleFx.module.css";

export type MiniBoardProps = {
  playerId: string;
  name: string;
  /** 보이는 200칸 — 아직 받은 판이 없으면 null */
  cells: Uint8Array | null;
  /** 상대에게 쌓인 가비지 줄 */
  pending: number;
  /** 내 다음 공격 대상 */
  isTarget: boolean;
  /** 탈락 순위 — 살아 있으면 null */
  place: number | null;
  kos: number;
  /** 칸 크기(CSS px) */
  cell: number;
};

/**
 * 상대 미니보드 — 판만 단색 칸으로(입체 스프라이트 없이) 그린다. 칸이 바뀔 때만 다시 그린다
 * data-attack-anchor로 공격 궤적의 도착점이 된다
 */
export function MiniBoard({ playerId, name, cells, pending, isTarget, place, kos, cell }: MiniBoardProps) {
  const reduced = useReducedEffects();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = cell * BOARD_COLS;
  const height = cell * BOARD_VISIBLE_ROWS;
  const out = place !== null;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
    ctx.fillRect(0, 0, width, height);
    if (!cells) return;
    for (let row = 0; row < BOARD_VISIBLE_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const value = cells[row * BOARD_COLS + col];
        if (value === 0) continue;
        ctx.fillStyle = CELL_COLORS[value] ?? CELL_COLORS[8];
        ctx.fillRect(col * cell, row * cell, cell - (cell > 4 ? 1 : 0), cell - (cell > 4 ? 1 : 0));
      }
    }
  }, [cells, cell, width, height]);

  return (
    <figure className="flex min-w-0 flex-col items-center gap-1" data-attack-anchor={playerId}>
      <div
        className={`relative rounded-md border-2 p-px transition-colors ${
          out ? "border-slate-700" : isTarget ? "border-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.55)]" : "border-slate-600/70"
        }`}
      >
        <canvas ref={canvasRef} style={{ width, height }} className={`block ${out ? "opacity-40 grayscale" : ""}`} role="img" aria-label={`${name}의 판`} />
        {/* 쌓인 가비지 — 판 왼쪽 막대 */}
        {pending > 0 && !out && (
          <span
            className="absolute bottom-px left-0 w-1 bg-rose-500"
            style={{ height: Math.min(height, pending * cell) }}
            role="img"
            aria-label={`가비지 ${pending}줄 대기`}
          />
        )}
        {/* KO 폭발 — 탈락 순간 한 번 (연출 줄이기면 없음) */}
        {out && !reduced && <span className={fx.koBurst} aria-hidden="true" />}
        {out && (
          <span
            className={`absolute inset-0 flex items-center justify-center text-lg font-black text-slate-200 ${fx.koMark}`}
            role="img"
            aria-label={`${place}위로 탈락`}
          >
            ✕
          </span>
        )}
      </div>
      {/* 이름이 길어도 판 폭을 넘지 않게 — 늘어난 캡션이 상대 줄을 넓혀 옆 버튼과 겹치지 않도록 */}
      <figcaption className="flex items-center gap-1 text-[11px] leading-none text-slate-300" style={{ maxWidth: width + 6 }}>
        {isTarget && !out && (
          <span className="text-rose-300" role="img" aria-label="공격 대상">
            ▲
          </span>
        )}
        <span className="truncate">{name}</span>
        {kos > 0 && <span className="shrink-0 rounded bg-amber-500/20 px-1 text-amber-200">KO {kos}</span>}
      </figcaption>
    </figure>
  );
}
