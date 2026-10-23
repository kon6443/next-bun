import { describe, it, expect, vi } from 'vitest';
import { SOUND, Sfx } from './sfx';

/** 가짜 AudioContext — 만든 노드 수와 상태만 흉내 */
function fakeContext() {
  const sources: { onended: (() => void) | null }[] = [];
  const param = () => ({ setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), value: 0 });
  const node = () => ({ connect: vi.fn(), gain: param(), frequency: param(), type: '' });
  const source = () => {
    const s = { ...node(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null, buffer: null };
    sources.push(s);
    return s;
  };
  const ctx = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createGain: node,
    createDynamicsCompressor: node,
    createBiquadFilter: node,
    createOscillator: source,
    createBufferSource: source,
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    close: vi.fn(async () => {}),
  };
  return { ctx, sources };
}

describe('효과음 (audio/sfx)', () => {
  it('꺼진 동안은 AudioContext를 만들지 않고 아무 소리도 내지 않는다 — 켤 때 한 번만 만든다', async () => {
    const { ctx } = fakeContext();
    const create = vi.fn(() => ctx as unknown as AudioContext);
    const sfx = new Sfx(create);
    expect(sfx.play(SOUND.BUILD, 0)).toBe(false);
    sfx.setEnabled(false);
    expect(create).not.toHaveBeenCalled();
    sfx.setEnabled(true);
    sfx.setEnabled(false);
    sfx.setEnabled(true);
    expect(create).toHaveBeenCalledTimes(1);
    // 끄기(suspend)가 끝난 뒤 원하는 상태(켜짐)로 다시 맞춘다 — 빠른 끄기·켜기 경쟁
    await new Promise((r) => setTimeout(r, 0));
    expect(sfx.play(SOUND.BUILD, 0)).toBe(true);
  });

  it('제스처 밖 resume이 settle되지 않아도(명세) 다음 제스처의 unlock이 resume을 다시 부른다', () => {
    const { ctx } = fakeContext();
    ctx.state = 'suspended';
    ctx.resume = vi.fn(() => new Promise<void>(() => {})); // 영원히 대기
    const sfx = new Sfx(() => ctx as unknown as AudioContext);
    sfx.setEnabled(true); // 생성 + sync → resume 대기(switching)
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    sfx.unlock();
    expect(ctx.resume).toHaveBeenCalledTimes(2);
  });

  it('suspend 중에 다시 켜도 끝난 뒤 resume — 멈춘 채 남지 않는다', async () => {
    const { ctx } = fakeContext();
    const sfx = new Sfx(() => ctx as unknown as AudioContext);
    sfx.setEnabled(true);
    sfx.setPaused(true);
    sfx.setPaused(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.state).toBe('running');
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('같은 종류 최소 간격(배속이 빠를수록 길다)·종류별 3음·끝나면 자리가 빈다', () => {
    const { ctx, sources } = fakeContext();
    const sfx = new Sfx(() => ctx as unknown as AudioContext);
    sfx.setEnabled(true);
    expect(sfx.play(SOUND.FIRE_ARCHER, 0)).toBe(true);
    expect(sfx.play(SOUND.FIRE_ARCHER, 30)).toBe(false); // 1×: 50ms
    expect(sfx.play(SOUND.FIRE_ARCHER, 60)).toBe(true);
    expect(sfx.play(SOUND.FIRE_ARCHER, 120)).toBe(true);
    expect(sfx.play(SOUND.FIRE_ARCHER, 200)).toBe(false); // 종류별 3음
    sources[0].onended?.();
    expect(sfx.play(SOUND.FIRE_ARCHER, 300)).toBe(true);
    sfx.setSpeed(3);
    expect(sfx.play(SOUND.HIT, 1000)).toBe(true);
    expect(sfx.play(SOUND.HIT, 1100)).toBe(false); // 3×: 150ms
  });

  it('AudioContext 생성이 던지면 소리 없이 계속한다(켜기 호출이 던지지 않는다)', () => {
    const sfx = new Sfx(() => {
      throw new Error('blocked');
    });
    expect(() => sfx.setEnabled(true)).not.toThrow();
    expect(sfx.created).toBe(false);
    expect(sfx.play(SOUND.BUILD, 0)).toBe(false);
  });

  it('일시정지면 suspend하고 소리를 내지 않는다 · 다시 켜면 resume', async () => {
    const { ctx } = fakeContext();
    const sfx = new Sfx(() => ctx as unknown as AudioContext);
    sfx.setEnabled(true);
    sfx.setPaused(true);
    expect(ctx.suspend).toHaveBeenCalled();
    await Promise.resolve();
    expect(sfx.play(SOUND.DEATH, 0)).toBe(false);
    sfx.setPaused(false);
    expect(ctx.resume).toHaveBeenCalled();
  });
});
