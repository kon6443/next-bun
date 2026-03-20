import type { GameMap } from '../types/game';

/** 강가 맵 (기본 맵) */
export const RIVER_MAP: GameMap = {
  id: 'river',
  name: '평화로운 강가',
  width: 1200,
  height: 600,
  waterLineY: 240,
  fishingPoints: [
    {
      id: 'point-1',
      position: { x: 150, y: 260 },
      radius: 40,
    },
    {
      id: 'point-2',
      position: { x: 400, y: 255 },
      radius: 40,
    },
    {
      id: 'point-3',
      position: { x: 650, y: 260 },
      radius: 40,
    },
    {
      id: 'point-4',
      position: { x: 900, y: 250 },
      radius: 40,
    },
    {
      id: 'point-5',
      position: { x: 1080, y: 258 },
      radius: 40,
    },
  ],
  walkableArea: {
    x: 20,
    y: 270,
    width: 1160,
    height: 310,
  },
  colors: {
    sky: '#87CEEB',
    water: '#4a90d9',
    waterDeep: '#2c5f8a',
    ground: '#8fbc6b',
    groundDark: '#6a9a4a',
    grass: '#5d8a3c',
  },
};
