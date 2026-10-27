"use client";

import { useEffect, useRef } from "react";
import { drawBlock } from "../lib/blockSprites";
import { drawBoardLevelLayer } from "../lib/levelLayers";
import { type SkinSlot, backgroundStyle, blockSkin, boardSkin, effectSkin } from "../lib/skins";

type Props = {
  slot: SkinSlot;
  id: string;
  /** 아이템 레벨 1~5(skin-levels) — 생략하면 1. 움직이는 강화는 멈춘 모습으로 */
  level?: number;
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
export function SkinPreview({ slot, id, level = 1, width = 120, height = 64 }: Props) {
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
      SAMPLE_PIECES.forEach((piece, i) => drawBlock(ctx, left + i * cell, top, cell, piece + 1, dpr, 1, id, level));
      return;
    }

    if (slot === "board") {
      const cell = Math.max(6, Math.floor(height / 6));
      // 투명 보드는 바탕이 비친다 — 미리보기에선 체크 무늬로 비침을 보인다
      if ((board.opacity ?? 1) < 0.9) {
        ctx.fillStyle = "rgba(148, 163, 184, 0.08)";
        for (let x = 0; x < width; x += cell) for (let y = (x / cell) % 2 ? cell : 0; y < height; y += cell * 2) ctx.fillRect(x, y, cell, cell);
      }
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
      // 레벨 레이어 — 판을 위 격자에 맞춘 한 칸 안쪽으로 본다(격자 점이 교차점에, 판 밖 4px 모서리 브래킷이 미리보기 안에 오게)
      const columns = Math.max(1, Math.floor(width / cell) - 2);
      const rows = Math.max(1, Math.floor(height / cell) - 2);
      drawBoardLevelLayer(ctx, { cell, boardX: cell, boardY: cell }, columns * cell, rows * cell, board.levelNeon[0], level, 0, false, { columns, rows });
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
    // Lv2부터 메아리 링 · Lv3부터 링·문구 발광
    if (level >= 3) {
      ctx.shadowColor = fx.ring.big;
      ctx.shadowBlur = 8;
    }
    for (let k = 0; k < (level >= 2 ? 2 : 1); k++) {
      ctx.globalAlpha = k === 0 ? 1 : 0.5;
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, width * (0.42 - k * 0.1), height * (0.22 - k * 0.05), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = `800 ${Math.round(height * 0.22)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const words = ["2", "COMBO", "4"];
    const fontSize = height * 0.22;
    words.forEach((word, i) => {
      const color = fx.tierColors[i + 1];
      if (level >= 3) ctx.shadowColor = color;
      if (level >= 4) {
        // 다음 단계 색으로 넘어가는 문구 그라데이션
        const y = height * 0.28;
        const fill = ctx.createLinearGradient(0, y - fontSize / 2, 0, y + fontSize / 2);
        fill.addColorStop(0, "#ffffff");
        fill.addColorStop(0.45, color);
        fill.addColorStop(1, fx.tierColors[Math.min(i + 2, fx.tierColors.length - 1)]);
        ctx.fillStyle = fill;
      } else {
        ctx.fillStyle = color;
      }
      ctx.fillText(word, (width / 4) * (i + 1), height * 0.28);
    });
    if (level >= 5) {
      // 불꽃 — 멈춘 모습
      ctx.shadowBlur = 0;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = fx.tierColors[1 + (i % 4)];
        const x = width * (0.08 + ((i * 37) % 84) / 100);
        const y = height * (0.62 + ((i * 53) % 30) / 100);
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
  }, [slot, id, level, width, height]);

  if (slot === "background") {
    return <div aria-hidden="true" className="rounded-md" style={{ width, height, background: backgroundStyle(id, level) }} />;
  }
  return <canvas ref={canvasRef} aria-hidden="true" className="block rounded-md" style={{ width, height }} />;
}

/** 블록 스킨이 7종을 무늬로도 가르는지 — 미리보기 아래 안내용 */
export function hasPatterns(id: string): boolean {
  return blockSkin(id).patterns;
}
