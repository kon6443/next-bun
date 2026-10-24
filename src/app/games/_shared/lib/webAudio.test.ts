import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAudioContext, createNoiseBuffer, isAudioHalted } from './webAudio';

afterEach(() => vi.unstubAllGlobals());

describe('webAudio (games-polish FE-56)', () => {
  it('생성자가 없거나 던지면 null, 접두어 생성자도 쓴다', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(createAudioContext()).toBeNull();
    vi.stubGlobal('AudioContext', function () {
      throw new Error('blocked');
    });
    expect(createAudioContext()).toBeNull();
    const fake = {};
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', function () {
      return fake;
    });
    expect(createAudioContext()).toBe(fake);
  });

  it('노이즈는 0.5초 모노, -1~1', () => {
    const data = new Float32Array(24000);
    const createBuffer = vi.fn(() => ({ getChannelData: () => data }));
    createNoiseBuffer({ sampleRate: 48000, createBuffer } as unknown as AudioContext);
    expect(createBuffer).toHaveBeenCalledWith(1, 24000, 48000);
    expect(data.every((v) => v >= -1 && v <= 1)).toBe(true);
  });

  it('running·closed가 아니면 멈춘 것(interrupted 포함)', () => {
    const at = (state: string) => isAudioHalted({ state } as AudioContext);
    expect([at('running'), at('closed'), at('suspended'), at('interrupted')]).toEqual([false, false, true, true]);
  });
});
