import { type MutableRefObject, type RefObject, useEffect, useRef } from "react";
import { type Camera, type ViewSize, panBy, screenToWorld, zoomAt } from "../renderer/camera";
import type { AimDrag } from "./useBattleView";

type Bounds = { bottomPx: number; sidePx: number; skyTop?: number };

/**
 * 전장 카메라 입력 — 한 손가락 끌기 = 둘러보기, 두 손가락 = 확대, 휠 = 확대. 포신 근처를 누르면(aimDrag.start가 true) 그 손가락은 조준을 움직인다
 * 둘러보기·휠은 자동 추적을 끈다("내 탱크로"로 다시 켠다). 카메라·손가락은 그리기 루프와 같은 ref를 쓴다
 */
export function useCameraInput({
  cameraRef,
  viewRef,
  canvasRef,
  pointersRef,
  aimPointerRef,
  aimDragRef,
  getInsetsRef,
  setFollow,
  userBounds,
}: {
  cameraRef: MutableRefObject<Camera>;
  viewRef: RefObject<ViewSize>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  pointersRef: MutableRefObject<Map<number, { x: number; y: number }>>;
  aimPointerRef: MutableRefObject<number | null>;
  aimDragRef: MutableRefObject<AimDrag | undefined>;
  getInsetsRef: MutableRefObject<(() => { bottom: number; side?: number }) | undefined>;
  setFollow: (v: boolean) => void;
  /** 손가락 조작의 카메라 범위(아래 조작부·하늘 위쪽) */
  userBounds: () => Bounds;
}) {
  const pinchRef = useRef<number | null>(null);
  const toWorld = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToWorld(cameraRef.current, viewRef.current, e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 0 && aimPointerRef.current === null && aimDragRef.current) {
      const [wx, wy] = toWorld(e);
      if (aimDragRef.current.start(wx, wy, cameraRef.current.zoom)) {
        aimPointerRef.current = e.pointerId;
        return;
      }
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setFollow(false);
    pinchRef.current = null;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimPointerRef.current === e.pointerId) {
      const [wx, wy] = toWorld(e);
      aimDragRef.current?.move(wx, wy, cameraRef.current.zoom);
      return;
    }
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const view = viewRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (pointers.size === 1) {
      cameraRef.current = panBy(cameraRef.current, view, e.clientX - prev.x, e.clientY - prev.y, userBounds());
    } else if (pointers.size === 2) {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const dist = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        const mid = { x: (e.clientX + other.x) / 2 - rect.left, y: (e.clientY + other.y) / 2 - rect.top };
        if (pinchRef.current) cameraRef.current = zoomAt(cameraRef.current, view, mid.x, mid.y, dist / pinchRef.current, userBounds());
        pinchRef.current = dist;
      }
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (aimPointerRef.current === e.pointerId) {
      aimPointerRef.current = null;
      aimDragRef.current?.end();
      return;
    }
    pointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // React onWheel은 passive라 preventDefault가 안 된다 — 직접 붙인다
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      setFollow(false);
      cameraRef.current = zoomAt(cameraRef.current, viewRef.current, e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12, { bottomPx: getInsetsRef.current?.().bottom ?? 0, sidePx: getInsetsRef.current?.().side ?? 0 });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [canvasRef, viewRef, setFollow, cameraRef, getInsetsRef]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp };
}
