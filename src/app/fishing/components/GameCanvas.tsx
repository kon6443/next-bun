'use client';

import { useState, useCallback, useRef } from 'react';
import { useGameCanvas } from '../hooks/useGameCanvas';
import { useGameLoop } from '../hooks/useGameLoop';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import { useFishingState } from '../hooks/useFishingState';
import { renderMap, renderPlayer, updateCamera } from '../engine/renderer';
import { findNearbyFishingPoint } from '../engine/collision';
import type { GameMap, Camera, FishingPoint } from '../types/game';
import type { Fish } from '../types/fish';
import type { Player } from '../types/player';
import { createDefaultPlayer } from '../types/player';
import FishingHUD from './FishingHUD';
import FishResultModal from './FishResultModal';
import InventoryPanel from './InventoryPanel';

interface GameCanvasProps {
  map: GameMap;
  fishPool: Fish[];
}

/** 플레이어를 idle 상태로 리셋 */
function resetPlayerToIdle(player: Player): Player {
  return {
    ...player,
    fishingState: 'idle',
    isMoving: false,
    targetPosition: null,
  };
}

export default function GameCanvas({ map, fishPool }: GameCanvasProps) {
  const { canvasRef, size } = useGameCanvas();
  const { setTarget, updatePosition } = usePlayerMovement(map);
  const {
    fishingCtx,
    startFishing,
    onBiteTap,
    onChallengeTap,
    dismiss,
    cancelFishing,
    updateFishing,
  } = useFishingState(fishPool);

  const playerRef = useRef<Player>(createDefaultPlayer());
  const cameraRef = useRef<Camera>({ x: 0, y: 0 });
  const [nearbyPoint, setNearbyPoint] = useState<FishingPoint | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const prevNearbyIdRef = useRef<string | null>(null);

  useGameLoop((deltaTime, totalTime) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    playerRef.current = updatePosition(playerRef.current, deltaTime);
    updateFishing(deltaTime);

    const nearby = findNearbyFishingPoint(playerRef.current, map);
    const nearbyId = nearby?.id ?? null;
    if (nearbyId !== prevNearbyIdRef.current) {
      prevNearbyIdRef.current = nearbyId;
      setNearbyPoint(nearby);
    }

    cameraRef.current = updateCamera(playerRef.current, map, size.width, size.height);

    ctx.clearRect(0, 0, size.width, size.height);
    renderMap(ctx, map, cameraRef.current, size.width, size.height, totalTime);
    renderPlayer(ctx, playerRef.current, cameraRef.current, fishingCtx.state, totalTime);
  });

  const handleCanvasInteraction = useCallback(
    (clientX: number, clientY: number) => {
      if (fishingCtx.state !== 'idle') return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      playerRef.current = setTarget(
        playerRef.current,
        clientX - rect.left + cameraRef.current.x,
        clientY - rect.top + cameraRef.current.y,
      );
    },
    [fishingCtx.state, setTarget, canvasRef],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      const touch = e.touches[0];
      handleCanvasInteraction(touch.clientX, touch.clientY);
    },
    [handleCanvasInteraction],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => handleCanvasInteraction(e.clientX, e.clientY),
    [handleCanvasInteraction],
  );

  const handleStartFishing = useCallback(() => {
    if (!nearbyPoint) return;
    playerRef.current = { ...playerRef.current, isMoving: false, targetPosition: null, fishingState: 'casting' };
    startFishing(nearbyPoint);
  }, [nearbyPoint, startFishing]);

  const handleDismiss = useCallback(() => {
    playerRef.current = resetPlayerToIdle(playerRef.current);
    dismiss();
  }, [dismiss]);

  const handleCancel = useCallback(() => {
    playerRef.current = resetPlayerToIdle(playerRef.current);
    cancelFishing();
  }, [cancelFishing]);

  const handleOpenInventory = useCallback(() => setInventoryOpen(true), []);
  const handleCloseInventory = useCallback(() => setInventoryOpen(false), []);

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ touchAction: 'none' }}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
      />

      <FishingHUD
        fishingState={fishingCtx.state}
        mapName={map.name}
        nearbyPoint={nearbyPoint}
        currentFish={fishingCtx.currentFish}
        waitProgress={fishingCtx.waitProgress}
        biteTimeLeft={fishingCtx.biteTimeLeft}
        challengeGauge={fishingCtx.challengeGauge}
        challengeZone={fishingCtx.challengeZone}
        inventoryCount={fishingCtx.inventory.length}
        onStartFishing={handleStartFishing}
        onBiteTap={onBiteTap}
        onChallengeTap={onChallengeTap}
        onCancel={handleCancel}
        onOpenInventory={handleOpenInventory}
      />

      {(fishingCtx.state === 'success' || fishingCtx.state === 'fail') && (
        <FishResultModal
          type={fishingCtx.state === 'success' ? 'success' : 'fail'}
          fish={fishingCtx.lastCatch}
          onDismiss={handleDismiss}
        />
      )}

      <InventoryPanel
        inventory={fishingCtx.inventory}
        isOpen={inventoryOpen}
        onClose={handleCloseInventory}
      />
    </div>
  );
}
