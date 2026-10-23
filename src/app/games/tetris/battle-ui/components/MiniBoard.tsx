"use client";

import { memo, useEffect, useRef } from "react";
import { BOARD_COLS, BOARD_VISIBLE_ROWS } from "@/types/tetrisBattleSocket";
import { CELL_COLORS } from "../../lib/blockSprites";
import { useReducedEffects } from "../../hooks/useReducedEffects";
import fx from "./battleFx.module.css";
import { PresenceDot } from "./PresenceDot";

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
  /** 탈락했지만 순위를 아직 모른다(재입장 복구) */
  out?: boolean;
  kos: number;
  /** 칸 크기(CSS px) */
  cell: number;
  /** 접속 중 — 끊기면(하트비트 끊김 포함) 회색 점 + "오프라인" (D-010). 모르면 온라인으로 본다 */
  online?: boolean;
  /** 공격 궤적 도착점 — 크게 본 사본은 false(같은 playerId 기준점이 둘이 되지 않게) */
  anchor?: boolean;
};

/**
 * 상대 미니보드 — 판만 단색 칸으로(입체 스프라이트 없이) 그린다. 칸이 바뀔 때만 다시 그린다
 * data-attack-anchor로 공격 궤적의 도착점이 된다
 */
export const MiniBoard = memo(function MiniBoard({
  playerId,
  name,
  cells,
  pending,
  isTarget,
  place,
  out: outUnranked = false,
  kos,
  cell,
  online = true,
  anchor = true,
}: MiniBoardProps) {
  const reduced = useReducedEffects();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = cell * BOARD_COLS;
  const height = cell * BOARD_VISIBLE_ROWS;
  const out = place !== null || outUnranked;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // 크기가 같으면 백버퍼를 다시 만들지 않는다 — 아래 전체 채우기가 지우기를 겸한다 (FE-19)
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
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
    <figure className="flex min-w-0 flex-col items-center gap-1" data-attack-anchor={anchor ? playerId : undefined}>
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
            aria-label={place !== null ? `${place}위로 탈락` : "탈락"}
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
        <PresenceDot online={online} />
        <span className="truncate">{name}</span>
        {/* 판이 좁으면(3~4인 모바일) 글자가 판 폭을 넘친다 — 회색 점만 보이고 글자는 읽어 준다 */}
        {!online && <span className={cell < 8 ? "sr-only" : "shrink-0 text-slate-500"}>오프라인</span>}
        {kos > 0 && <span className="shrink-0 rounded bg-amber-500/20 px-1 text-amber-200">KO {kos}</span>}
      </figcaption>
    </figure>
  );
});
