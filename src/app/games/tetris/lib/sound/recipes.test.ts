import { describe, expect, it } from 'vitest';
import type { SoundCue, SoundCueKind } from '../effects';
import { COMBO_MAX_SEMITONES, MUSIC_PATTERN_STEPS, musicStep, recipeFor, type ToneVoice } from './recipes';

const ALL_KINDS: SoundCueKind[] = [
  'move', 'rotate', 'hold', 'hardDrop', 'lock', 'clear', 'tspin', 'combo', 'b2b',
  'perfectClear', 'levelUp', 'gameOver', 'attack', 'garbage', 'ko', 'win', 'countdown', 'go',
];

const firstFreq = (cue: SoundCue) => (recipeFor(cue).voices.find((v) => v.type === 'tone') as ToneVoice).freq;

describe('recipeFor', () => {
  it('cue 종류마다 서로 다른 레시피를 낸다', () => {
    const serialized = ALL_KINDS.map((kind) => JSON.stringify(recipeFor({ kind, value: 1 })));
    expect(new Set(serialized).size).toBe(ALL_KINDS.length);
  });

  it('모든 voice는 양수 길이·0~1 음량·0 이상 시작을 가진다', () => {
    for (const kind of ALL_KINDS) {
      for (const value of [undefined, 0, 1, 4, 99, Number.NaN]) {
        const recipe = recipeFor({ kind, value });
        expect(recipe.voices.length).toBeGreaterThan(0);
        expect(recipe.throttleMs).toBeGreaterThan(0);
        for (const v of recipe.voices) {
          expect(v.duration).toBeGreaterThan(0);
          expect(v.start).toBeGreaterThanOrEqual(0);
          expect(v.gain).toBeGreaterThan(0);
          expect(v.gain).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('clear 1~4줄은 서로 다른 화음이고 4줄이 가장 화려하다', () => {
    const recipes = [1, 2, 3, 4].map((value) => recipeFor({ kind: 'clear', value }));
    expect(new Set(recipes.map((r) => JSON.stringify(r))).size).toBe(4);
    const counts = recipes.map((r) => r.voices.length);
    expect(Math.max(...counts)).toBe(counts[3]);
  });

  it('combo는 단계마다 반음씩 오르고 상한에서 멈춘다', () => {
    const freqs = Array.from({ length: COMBO_MAX_SEMITONES + 1 }, (_, i) => firstFreq({ kind: 'combo', value: i + 1 }));
    for (let i = 1; i < freqs.length; i++) {
      expect(freqs[i] / freqs[i - 1]).toBeCloseTo(2 ** (1 / 12), 6);
    }
    expect(firstFreq({ kind: 'combo', value: COMBO_MAX_SEMITONES + 5 })).toBe(freqs[freqs.length - 1]);
  });

  it('범위 밖 값은 보정한다 — clear 9는 4줄, clear 없음은 1줄', () => {
    expect(recipeFor({ kind: 'clear', value: 9 })).toEqual(recipeFor({ kind: 'clear', value: 4 }));
    expect(recipeFor({ kind: 'clear' })).toEqual(recipeFor({ kind: 'clear', value: 1 }));
  });

  it('move는 가장 짧고 throttle이 있다', () => {
    const move = recipeFor({ kind: 'move' });
    expect(move.throttleMs).toBeGreaterThanOrEqual(30);
    expect(move.voices[0].duration).toBeLessThanOrEqual(0.03);
  });
});

describe('musicStep', () => {
  it('루프는 주기적이고 마디 첫 칸에 아르페지오와 베이스가 함께 있다', () => {
    expect(musicStep(0)).toEqual(musicStep(MUSIC_PATTERN_STEPS));
    expect(musicStep(0)).toHaveLength(2);
    expect(musicStep(1)).toHaveLength(0);
  });
});
