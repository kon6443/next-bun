"use client";

import { useEffect, useRef } from "react";
import { drawBlock } from "../lib/blockSprites";
import { type SkinSlot, backgroundSkin, blockSkin, boardSkin, effectSkin } from "../lib/skins";

type Props = {
  slot: SkinSlot;
  id: string;
  /** CSS px */
  width?: number;
  height?: number;
};

/** 미리보기에 보일 블록 — I J L O S T Z 각 한 칸씩(무늬·색 구분이 보이게) */
const SAMPLE_PIECES = [0, 1, 2, 3, 4, 5, 6];

/**
 * 스킨 아이템 미리보기 — 슬롯마다 그 슬롯이 바꾸는 것만 보인다(블록 7종 · 판 배경·격자·네온 · 연출 색 · 화면 바탕)
 * 다른 슬롯은 기본으로 그린다
 */
export function SkinPreview({ slot, id, width = 120, height = 64 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (slot === "background") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const board = boardSkin(slot === "board" ? id : undefined);
    const [r, g, b] = board.levelTints[0];
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, width, height);

    if (slot === "block") {
      const cell = Math.floor(Math.min(width / 8, height / 2.2));
      const top = Math.round((height - cell) / 2);
      const left = Math.round((width - cell * 7) / 2);
      SAMPLE_PIECES.forEach((piece, i) => drawBlock(ctx, left + i * cell, top, cell, piece + 1, dpr, 1, id));
      return;
    }

    if (slot === "board") {
      const cell = Math.max(6, Math.floor(height / 6));
      ctx.strokeStyle = board.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = cell; x < width; x += cell) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, height);
      }
      for (let y = cell; y < height; y += cell) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(width, y + 0.5);
      }
      ctx.stroke();
      // 레벨 1~5 네온 띠 — 레벨이 오르면 바뀌는 색
      const band = width / 5;
      board.levelNeon.slice(0, 5).forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(i * band + 2, height - 5, band - 4, 3);
      });
      ctx.strokeStyle = board.levelNeon[0];
      ctx.strokeRect(1, 1, width - 2, height - 2);
      return;
    }

    // effect — 콤보 단계 문구 색과 줄 삭제 충격파(잔상·조각은 블록 색이라 블록 슬롯)
    const fx = effectSkin(id);
    const [fr, fg, fb] = fx.flashGlow;
    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, 0.35)`;
    ctx.fillRect(0, height / 2 - 6, width, 12);
    ctx.strokeStyle = fx.ring.big;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width * 0.42, height * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `800 ${Math.round(height * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = ["2", "COMBO", "4"];
    words.forEach((word, i) => {
      ctx.fillStyle = fx.tierColors[i + 1];
      ctx.fillText(word, (width / 4) * (i + 1), height * 0.28);
    });
  }, [slot, id, width, height]);

  if (slot === "background") {
    return <div aria-hidden="true" className="rounded-md" style={{ width, height, background: backgroundSkin(id).background }} />;
  }
  return <canvas ref={canvasRef} aria-hidden="true" className="block rounded-md" style={{ width, height }} />;
}

/** 블록 스킨이 7종을 무늬로도 가르는지 — 미리보기 아래 안내용 */
export function hasPatterns(id: string): boolean {
  return blockSkin(id).patterns;
}
