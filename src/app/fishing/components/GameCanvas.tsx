'use client';

import { useState, useCallback, useRef } from 'react';
import { useGameCanvas } from '../hooks/useGameCanvas';
import { useGameLoop } from '../hooks/useGameLoop';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import { useFishingState } from '../hooks/useFishingState';
import { useKeyboardInput } from '../hooks/useKeyboardInput';
import { renderMap, renderPlayer, renderSpeechBubble, updateCamera } from '../engine/renderer';
import type { SpeechBubble } from '../engine/renderer';
import { findNearbyFishingPoint } from '../engine/collision';
import type { GameMap, Camera, FishingPoint } from '../types/game';
import type { Fish } from '../types/fish';
import type { Player } from '../types/player';
import { createDefaultPlayer } from '../types/player';
import FishingHUD from './FishingHUD';
import FishResultModal from './FishResultModal';
import InventoryPanel from './InventoryPanel';
import ChatPanel from './ChatPanel';

interface GameCanvasProps {
  map: GameMap;
  fishPool: Fish[];
}

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
  const { setTarget, moveByDirection, updatePosition } = usePlayerMovement(map);
  const {
    fishingCtx,
    startFishing,
    onBiteTap,
    onChallengeTap,
    resetFishing,
    updateFishing,
  } = useFishingState(fishPool);
  const { consumeInput } = useKeyboardInput();

  const playerRef = useRef<Player>(createDefaultPlayer());
  const cameraRef = useRef<Camera>({ x: 0, y: 0 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const bubbleRef = useRef<SpeechBubble | null>(null);
  const totalTimeRef = useRef(0);

  // 게임 루프 내 stale closure 방지용 ref
  const fishingStateRef = useRef(fishingCtx.state);
  fishingStateRef.current = fishingCtx.state;

  const [nearbyPoint, setNearbyPoint] = useState<FishingPoint | null>(null);
  const nearbyPointRef = useRef<FishingPoint | null>(null);

  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const prevNearbyIdRef = useRef<string | null>(null);

  useGameLoop((deltaTime, totalTime) => {
    const canvas = canvasRef.current;
    if (!canvas || size.width === 0) return;

    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d');
    }
    const ctx = ctxRef.current;
    if (!ctx) return;

    totalTimeRef.current = totalTime;

    const input = consumeInput();

    // 이동 (ref에서 최신 상태 읽기)
    if (input.direction && fishingStateRef.current === 'idle') {
      playerRef.current = moveByDirection(playerRef.current, input.direction, deltaTime);
    } else {
      playerRef.current = updatePosition(playerRef.current, deltaTime);
    }

    // 키보드 액션
    if (input.actionPressed) {
      handleKeyboardAction();
    }
    if (input.enterPressed) {
      setChatOpen(true);
    }
    if (input.escapePressed) {
      setChatOpen(false);
      setInventoryOpen(false);
    }

    updateFishing(deltaTime);

    // 근처 낚시 포인트 (변경 시에만 setState)
    const nearby = findNearbyFishingPoint(playerRef.current, map);
    const nearbyId = nearby?.id ?? null;
    if (nearbyId !== prevNearbyIdRef.current) {
      prevNearbyIdRef.current = nearbyId;
      nearbyPointRef.current = nearby;
      setNearbyPoint(nearby);
    }

    cameraRef.current = updateCamera(playerRef.current, map, size.width, size.height);

    ctx.clearRect(0, 0, size.width, size.height);
    renderMap(ctx, map, cameraRef.current, size.width, size.height, totalTime);
    renderPlayer(ctx, playerRef.current, cameraRef.current, fishingStateRef.current, totalTime);
    renderSpeechBubble(ctx, playerRef.current, cameraRef.current, bubbleRef.current, totalTime);
  });

  /** Space 키 → 현재 상태에 맞는 액션 (ref에서 최신 상태 읽기) */
  const handleKeyboardAction = useCallback(() => {
    const state = fishingStateRef.current;
    const nearby = nearbyPointRef.current;

    switch (state) {
      case 'idle':
        if (nearby) {
          playerRef.current = { ...playerRef.current, isMoving: false, targetPosition: null, fishingState: 'casting' };
          startFishing(nearby);
        }
        break;
      case 'bite':
        onBiteTap();
        break;
      case 'challenge':
        onChallengeTap();
        break;
      case 'success':
      case 'fail':
        playerRef.current = resetPlayerToIdle(playerRef.current);
        resetFishing();
        break;
      case 'waiting':
        playerRef.current = resetPlayerToIdle(playerRef.current);
        resetFishing();
        break;
    }
  }, [startFishing, onBiteTap, onChallengeTap, resetFishing]);

  const handleCanvasInteraction = useCallback(
    (clientX: number, clientY: number) => {
      if (fishingStateRef.current !== 'idle') return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      playerRef.current = setTarget(
        playerRef.current,
        clientX - rect.left + cameraRef.current.x,
        clientY - rect.top + cameraRef.current.y,
      );
    },
    [setTarget, canvasRef],
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
    const nearby = nearbyPointRef.current;
    if (!nearby) return;
    playerRef.current = { ...playerRef.current, isMoving: false, targetPosition: null, fishingState: 'casting' };
    startFishing(nearby);
  }, [startFishing]);

  const handleDismiss = useCallback(() => {
    playerRef.current = resetPlayerToIdle(playerRef.current);
    resetFishing();
  }, [resetFishing]);

  const handleOpenInventory = useCallback(() => setInventoryOpen(true), []);
  const handleCloseInventory = useCallback(() => setInventoryOpen(false), []);
  const handleToggleChat = useCallback(() => setChatOpen((v) => !v), []);

  const handleSendMessage = useCallback((text: string) => {
    bubbleRef.current = { text, createdAt: totalTimeRef.current };
  }, []);

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
        onCancel={handleDismiss}
        onOpenInventory={handleOpenInventory}
        onToggleChat={handleToggleChat}
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

      <ChatPanel
        isOpen={chatOpen}
        onClose={handleToggleChat}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
