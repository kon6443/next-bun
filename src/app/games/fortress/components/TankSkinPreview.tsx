"use client";

import { useEffect, useMemo, useRef } from "react";
import { type MapId, TANK_RADIUS, type Terrain, createMatch } from "../engine";
import type { Camera } from "../renderer/camera";
import { SLOT_COLORS, drawScene, tankDrawScale } from "../renderer/drawScene";
import { type TerrainLayer, createTerrainLayer, paintAll } from "../renderer/terrainLayer";
import type { TankSkin } from "../lib/tankSkins";
import { useFortressCanvas } from "../hooks/useFortressCanvas";
import { type Look, lookFromUrl, usesVivid } from "../lib/look";

export type PreviewTank = { skin: TankSkin; color?: string; label?: string };

/** 미리보기 지형 — 경기 맵 생성기를 그대로 쓴다(시드 고정) */
const PREVIEW_SEED = 11;
/** 탱크 사이 간격(월드 px) */
const GAP = 64;
const WORLD_CENTER = 1024;

/** 표면 높이(월드 y) — 열의 첫 구간 top */
function surfaceAt(terrain: Terrain, x: number): number {
  return terrain.cols[Math.round(x)]?.[0] ?? 600;
}

/**
 * 맵별 미리보기 지형·지형 레이어는 모듈에서 한 번만 — 스킨 화면에 미리보기가 여러 개라 각자 만들면 월드 크기 캔버스가 겹겹이 쌓인다(iOS 메모리)
 * 레이어는 그리기 전용(drawImage 원본)이라 여러 캔버스가 같이 써도 된다. 마지막 미리보기가 사라지면 레이어(월드 크기 캔버스, 맵마다 8MB)를 놓는다
 */
const previewTerrains = new Map<MapId, Terrain | null>();
/** 레이어 열쇠 — 맵 + 칠(기본·vivid) */
const previewLayers = new Map<string, TerrainLayer | null>();
function previewTerrain(mapId: MapId): Terrain | null {
  if (!previewTerrains.has(mapId)) {
    const created = createMatch({ seed: PREVIEW_SEED, mapId, mode: "ffa", players: [0, 1].map((slot) => ({ slot, team: 0, tankId: 0 })) });
    previewTerrains.set(mapId, created.ok ? created.state.terrain : null);
  }
  return previewTerrains.get(mapId) ?? null;
}
let previewUsers = 0;
/** 미리보기 하나가 레이어를 쓰기 시작 — 돌려준 함수로 놓는다. 아무도 안 쓰면 캔버스 메모리를 비우고 다음에 다시 만든다 */
function retainPreviewLayers(): () => void {
  previewUsers += 1;
  return () => {
    previewUsers -= 1;
    if (previewUsers > 0) return;
    for (const layer of previewLayers.values()) {
      if (!layer) continue;
      layer.canvas.width = 0;
      layer.canvas.height = 0;
    }
    previewLayers.clear();
  };
}

function previewLayer(mapId: MapId, terrain: Terrain, vivid: boolean): TerrainLayer | null {
  const key = `${mapId}:${vivid ? "vivid" : "classic"}`;
  if (!previewLayers.get(key)) {
    const layer = createTerrainLayer({ vivid, mapId });
    if (layer) paintAll(layer, terrain);
    previewLayers.set(key, layer);
  }
  return previewLayers.get(key) ?? null;
}

/** 탱크 줄을 세울 가장 평평한 구간의 왼쪽 x — 높낮이(최고−최저)가 가장 작은 곳(맵 가장자리 제외) */
function flattestStart(terrain: Terrain, span: number): number {
  let best = WORLD_CENTER - span / 2;
  let bestRange = Infinity;
  for (let x0 = 160; x0 + span < terrain.cols.length - 160; x0 += 16) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = x0; x <= x0 + span; x += 8) {
      const y = surfaceAt(terrain, x);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    if (hi - lo < bestRange) {
      bestRange = hi - lo;
      best = x0;
    }
  }
  return best;
}

/** 그려지는 탱크의 위 끝(포신을 세웠을 때) — drawTank 기준, 그리는 반지름 R의 배수 */
const TANK_TOP_R = 3.05;

/**
 * 미리보기 카메라 — 탱크 줄 전체가 들어가는 줌, 세로는 그려지는 탱크(포신 끝 ~ 궤도 바닥)의 가운데
 * 줌이 작을수록 탱크를 크게 그린다(tankDrawScale, 최대 2.4배 → R ≤ 21.6). 판정 반지름 기준 가운데로 두면 48×36 같은 작은 칸에서 포신 끝이 잘렸다(D-025 리뷰)
 * 줌은 판정 반지름 기준 그대로 둬도 그려지는 크기가 들어간다: 높이 여유 TANK_RADIUS·9 = 81 ≥ 3.65·R최대 ≈ 78.8, 폭 여유 GAP·1.6 = 102.4 ≥ 3.4·R최대 ≈ 73.4
 * (위 상수를 바꾸면 이 부등식부터 다시 본다 — TankSkinPreview.camera.test가 화면 안에 들어가는지 확인한다)
 */
export function previewCamera(view: { width: number; height: number }, startX: number, span: number, minY: number, maxY: number, vivid = false): Camera {
  let zoom = Math.min(view.width / (span + GAP * 1.6), view.height / (maxY - minY + TANK_RADIUS * 9), 2.5);
  // 시안 탱크는 줌이 작을수록 더 크게(최대 4.2배) 그려 위 부등식이 깨진다 — 그려지는 크기로 몇 번 다시 맞춘다
  for (let k = 0; vivid && k < 6; k++) {
    const r = TANK_RADIUS * tankDrawScale(zoom, true);
    zoom = Math.min(zoom, view.height / (maxY - minY + r * 3.9), view.width / (span + r * 3.6));
  }
  const R = TANK_RADIUS * tankDrawScale(zoom, vivid);
  // 위·아래 여백이 같게 — 탱크 줄의 맨 위(포신 끝)와 맨 아래(궤도 바닥) 가운데
  return { cx: startX + span / 2, cy: (minY - R * TANK_TOP_R + maxY) / 2, zoom };
}

/**
 * 탱크 스킨 미리보기 (F7) — 실제 맵 위에 탱크를 나란히 세워 정지 화면 1장으로 그린다(연출·입력 없음)
 * 스킨 화면의 카드·큰 미리보기, 시안 확인에 쓴다
 */
export function TankSkinPreview({ tanks, mapId = "hills", className, label, look: lookProp }: { tanks: readonly PreviewTank[]; mapId?: MapId; className?: string; label: string; look?: Look }) {
  // 시안 확인용(D-025 B) — 지정하지 않으면 주소의 ?look=을 따른다(스킨 화면·대기실·홈을 새 탱크로 미리 보기). 없으면 기본 그림
  // 그림(보충 5) — 없으면 주소의 ?look(기본 vivid). 캔버스만 달라지고 마크업은 같아 서버·클라이언트 불일치가 없다
  const look = useMemo<Look>(() => lookProp ?? lookFromUrl(), [lookProp]);
  const terrain = useMemo(() => previewTerrain(mapId), [mapId]);
  // 그리기보다 먼저 — 첫 그리기가 만든 레이어를 이 미리보기가 쥐고 있게
  useEffect(() => retainPreviewLayers(), []);

  const draw = () => {
    const ctx = ctxRef.current;
    const view = viewRef.current;
    if (!ctx || !terrain || view.width === 0) return;
    const layer = previewLayer(mapId, terrain, usesVivid(look));
    // 가장 평평한 구간에 나란히 — 카메라는 탱크 줄을 담는 줌
    const span = GAP * Math.max(0, tanks.length - 1);
    const startX = flattestStart(terrain, span);
    const views = tanks.map((_, i) => {
      const x = startX + i * GAP;
      return { slot: i, x, y: surfaceAt(terrain, x), hp: 1, alive: true };
    });
    const minY = Math.min(...views.map((t) => t.y));
    const maxY = Math.max(...views.map((t) => t.y));
    const camera = previewCamera(view, startX, span, minY, maxY, usesVivid(look));
    drawScene(ctx, {
      camera,
      view,
      layer,
      tanks: views,
      colorOf: (slot) => tanks[slot]?.color ?? SLOT_COLORS[slot % SLOT_COLORS.length],
      skinOf: (slot) => tanks[slot].skin,
      labelOf: tanks.some((t) => t.label) ? (slot) => tanks[slot]?.label ?? "" : undefined,
      barrelOf: (slot) => (slot < tanks.length / 2 ? 55 : 125),
      activeSlot: null,
      offscreenChips: false,
      aim: null,
      shells: [],
      blasts: [],
      popups: [],
      time: 0,
      reducedMotion: true,
      look,
      mapId,
    });
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const { containerRef, canvasRef, ctxRef, viewRef } = useFortressCanvas(() => drawRef.current());

  useEffect(() => {
    drawRef.current();
  });

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className ?? ""}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block" role="img" aria-label={label} />
    </div>
  );
}
