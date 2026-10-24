// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recipeFor } from './recipes';
import { MAX_SFX_VOICES, __resetSoundPlayerForTests, createSoundPlayer, getSoundPlayer, orderCuesByPriority, replayCues, type SoundPlayer } from './soundPlayer';
import { __resetSoundSettingsForTests, saveSoundSettings } from './soundSettings';

/** 호출 수만 세는 가짜 AudioContext — 테스트가 currentTime을 직접 옮긴다 */
function createFakeContext() {
  const param = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: 'suspended' as AudioContextState,
    destination: node(),
    createGain: vi.fn(() => ({ ...node(), gain: param() })),
    createOscillator: vi.fn(() => ({ ...source(), type: 'sine', frequency: param(), detune: param() })),
    createBufferSource: vi.fn(() => ({ ...source(), buffer: null, loop: false })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: 'lowpass', frequency: param(), Q: param() })),
    createBuffer: vi.fn((_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    }),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended';
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed';
    }),
  };
  return ctx;
}

type FakeContext = ReturnType<typeof createFakeContext>;
/** resume()은 비동기 — 컨텍스트가 running이 된 뒤에야 시작된 것으로 본다 */
const flushResume = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const sourceCount = (ctx: FakeContext) => ctx.createOscillator.mock.calls.length + ctx.createBufferSource.mock.calls.length;
const voiceCount = (kind: Parameters<typeof recipeFor>[0]) => recipeFor(kind).voices.length;

describe('soundPlayer', () => {
  let fake: FakeContext;
  let createContext: ReturnType<typeof vi.fn<() => AudioContext | null>>;
  let clock: number;
  let player: SoundPlayer;

  const makePlayer = () =>
    createSoundPlayer({ createContext, now: () => clock });

  beforeEach(() => {
    window.localStorage.clear();
    __resetSoundSettingsForTests();
    fake = createFakeContext();
    createContext = vi.fn(() => fake as unknown as AudioContext);
    clock = 1000;
  });
  afterEach(() => {
    player?.dispose();
    __resetSoundPlayerForTests();
    vi.useRealTimers();
  });

  it('기본 꺼짐 — 저장값이 없으면 playCues·play·조작 이벤트가 있어도 AudioContext를 만들지 않는다', () => {
    player = makePlayer();
    player.playCues([{ kind: 'hardDrop' }, { kind: 'clear', value: 4 }]);
    player.play({ kind: 'move' });
    window.dispatchEvent(new Event('pointerdown'));
    player.unlock();
    player.setMusicPlaying(true);
    expect(createContext).not.toHaveBeenCalled();
    expect(player.isMusicRunning()).toBe(false);
  });

  it('효과음을 켜도 사용자 조작 전에는 context를 만들지 않고, 조작 뒤에는 cue마다 소스를 만든다', () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.playCues([{ kind: 'rotate' }]);
    expect(createContext).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('keydown'));
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(fake.resume).toHaveBeenCalled();

    const cues = [{ kind: 'hardDrop' }, { kind: 'clear', value: 2 }, { kind: 'b2b' }, { kind: 'combo', value: 1 }] as const;
    // 상한(MAX_SFX_VOICES) 아래인 조합 — 상한은 아래 테스트가 따로 본다
    player.playCues(cues);
    expect(sourceCount(fake)).toBe(cues.reduce((sum, cue) => sum + voiceCount(cue), 0));

    // 리스너는 1회 — 다시 조작해도 context를 새로 만들지 않는다
    window.dispatchEvent(new Event('pointerdown'));
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('move는 throttle 간격 안의 반복을 무시한다', () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.unlock();
    const throttle = recipeFor({ kind: 'move' }).throttleMs;

    player.playCues([{ kind: 'move' }, { kind: 'move' }, { kind: 'move' }]);
    expect(sourceCount(fake)).toBe(1);
    clock += throttle - 1;
    player.play({ kind: 'move' });
    expect(sourceCount(fake)).toBe(1);
    clock += 1;
    player.play({ kind: 'move' });
    expect(sourceCount(fake)).toBe(2);
  });

  it('동시에 울리는 voice는 상한을 넘지 않고, 끝난 voice 자리는 다시 쓴다', () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.unlock();
    for (let i = 0; i < 20; i++) {
      clock += 2000;
      player.playCues([{ kind: 'clear', value: 4 }, { kind: 'perfectClear' }, { kind: 'win' }]);
    }
    expect(sourceCount(fake)).toBe(MAX_SFX_VOICES);

    fake.currentTime = 10; // 모두 끝난 뒤
    clock += 2000;
    player.play({ kind: 'lock' });
    expect(sourceCount(fake)).toBe(MAX_SFX_VOICES + voiceCount({ kind: 'lock' }));
  });

  it('자리가 꽉 차 울리지 못한 소리는 쓰로틀 시각을 남기지 않는다 — 자리가 나면 곧바로 같은 소리를 낸다 (games-polish FE-18)', () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.unlock();
    for (let i = 0; i < 20; i++) {
      clock += 2000;
      player.playCues([{ kind: 'clear', value: 4 }, { kind: 'perfectClear' }, { kind: 'win' }]);
    }
    expect(sourceCount(fake)).toBe(MAX_SFX_VOICES);
    player.play({ kind: 'move' }); // 자리 없음 — 안 울린다
    expect(sourceCount(fake)).toBe(MAX_SFX_VOICES);
    fake.currentTime = 10; // 모두 끝남
    clock += 1; // move 쓰로틀 간격 안
    player.play({ kind: 'move' });
    expect(sourceCount(fake)).toBe(MAX_SFX_VOICES + voiceCount({ kind: 'move' }));
  });

  it('효과음을 끄면 이미 만든 context가 있어도 playCues가 아무것도 하지 않는다', () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.unlock();
    saveSoundSettings({ sfx: false });
    player.play({ kind: 'go' });
    expect(sourceCount(fake)).toBe(0);
    expect(fake.suspend).toHaveBeenCalled();
  });

  it('볼륨을 바꾸면 마스터 gain에 바로 반영한다', () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.unlock();
    const master = fake.createGain.mock.results[0].value;
    expect(master.gain.value).toBe(0.6);
    saveSoundSettings({ volume: 0.25 });
    expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, expect.any(Number), expect.any(Number));
  });

  it('music 설정이 꺼져 있으면 setMusicPlaying(true)여도 스케줄러가 돌지 않고, 켜면 돌고, 끄면 멈춘다', async () => {
    vi.useFakeTimers();
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    player.unlock();
    await flushResume();
    player.setMusicPlaying(true);
    expect(player.isMusicRunning()).toBe(false);
    expect(sourceCount(fake)).toBe(0);

    saveSoundSettings({ music: true });
    expect(player.isMusicRunning()).toBe(true);
    const afterStart = sourceCount(fake);
    expect(afterStart).toBeGreaterThan(0);
    // 0.5초 동안 시계를 옮기며 스케줄러를 깨운다 — 16분음표 몇 칸이 더 예약돼야 한다
    for (let i = 1; i <= 20; i++) {
      fake.currentTime = i * 0.025;
      vi.advanceTimersByTime(25);
    }
    expect(sourceCount(fake)).toBeGreaterThan(afterStart);

    saveSoundSettings({ music: false });
    expect(player.isMusicRunning()).toBe(false);
    const afterStop = sourceCount(fake);
    fake.currentTime = 2;
    vi.advanceTimersByTime(500);
    expect(sourceCount(fake)).toBe(afterStop);

    saveSoundSettings({ music: true });
    expect(player.isMusicRunning()).toBe(true);
    player.setMusicPlaying(false);
    expect(player.isMusicRunning()).toBe(false);
  });

  it('dispose하면 음악·리스너를 정리하고 context를 닫는다', () => {
    saveSoundSettings({ music: true });
    player = makePlayer();
    player.setMusicPlaying(true);
    player.dispose();
    window.dispatchEvent(new Event('pointerdown'));
    expect(createContext).not.toHaveBeenCalled();

    player = makePlayer();
    player.unlock();
    player.dispose();
    expect(fake.close).toHaveBeenCalled();
  });

  it('Web Audio가 없는 환경(jsdom)에서도 싱글턴이 예외 없이 동작한다', () => {
    saveSoundSettings({ sfx: true, music: true });
    const shared = getSoundPlayer();
    expect(getSoundPlayer()).toBe(shared);
    expect(() => {
      shared.unlock();
      shared.playCues([{ kind: 'ko' }]);
      shared.setMusicPlaying(true);
    }).not.toThrow();
    expect(shared.isMusicRunning()).toBe(false);
  });

  it('터치 첫 조작에서 시작이 거부되면(iOS) 리스너를 남겨 다음 조작(touchend·click)에서 다시 시도한다', async () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    fake.resume.mockImplementationOnce(async () => {
      throw new Error('NotAllowedError');
    });
    window.dispatchEvent(new Event('touchstart'));
    await flushResume();
    expect(fake.state).toBe('suspended');
    window.dispatchEvent(new Event('touchend'));
    await flushResume();
    expect(fake.resume).toHaveBeenCalledTimes(2);
    expect(fake.state).toBe('running');
    // running이 된 뒤에는 리스너를 뗀다 — 조작마다 resume하지 않는다
    window.dispatchEvent(new Event('click'));
    await flushResume();
    expect(fake.resume).toHaveBeenCalledTimes(2);
  });

  it('voice 상한을 넘으면 큰 사건부터 — 퍼펙트 클리어·줄 삭제가 이동·고정음보다 먼저 처리된다', () => {
    const tick = [{ kind: 'hardDrop' }, { kind: 'clear', value: 4 }, { kind: 'b2b' }, { kind: 'combo', value: 1 }, { kind: 'perfectClear' }] as const;
    expect(orderCuesByPriority(tick).map((c) => c.kind)).toEqual(['perfectClear', 'clear', 'b2b', 'combo', 'hardDrop']);
    // 이 조합의 voice 합이 상한을 넘을 수 있어도 퍼펙트 클리어는 통째로 들어간다
    expect(voiceCount({ kind: 'perfectClear' }) + voiceCount({ kind: 'clear', value: 4 })).toBeLessThanOrEqual(MAX_SFX_VOICES);
  });

  it('아직 시작되지 않은(suspended) 컨텍스트에는 효과음을 예약하지 않는다 — 시작 순간 한꺼번에 울리지 않게', async () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    fake.resume.mockImplementation(async () => {
      throw new Error('NotAllowedError');
    });
    window.dispatchEvent(new Event('touchstart'));
    await flushResume();
    player.playCues([{ kind: 'rotate' }, { kind: 'hardDrop' }]);
    expect(sourceCount(fake)).toBe(0);
  });

  it('시작된 뒤 다시 멈추면(빠른 끄기·켜기 경합) 조작 리스너를 다시 걸어 다음 조작에서 깨운다', async () => {
    saveSoundSettings({ sfx: true });
    player = makePlayer();
    window.dispatchEvent(new Event('click'));
    await flushResume();
    expect(fake.state).toBe('running');
    const calls = fake.resume.mock.calls.length;
    // 늦게 끝난 suspend — 브라우저가 statechange를 알린다
    fake.state = 'suspended';
    (fake as unknown as { onstatechange: () => void }).onstatechange();
    window.dispatchEvent(new Event('touchend'));
    await flushResume();
    expect(fake.resume.mock.calls.length).toBe(calls + 1);
    expect(fake.state).toBe('running');
  });
});

describe('replayCues (games-polish P7)', () => {
  const cues = [
    { kind: 'move' },
    { kind: 'lock' },
    { kind: 'clear', value: 1 },
    { kind: 'clear', value: 4 },
    { kind: 'tspin', value: 2 },
    { kind: 'b2b' },
    { kind: 'combo', value: 3 },
    { kind: 'perfectClear' },
    { kind: 'gameOver' },
  ] as const;
  it('4배속 미만은 그대로, 4배속부터는 큰 사건만(4줄·T-스핀·B2B·퍼펙트·승패)', () => {
    expect(replayCues(cues, 2)).toBe(cues);
    expect(replayCues(cues, 4).map((c) => c.kind + ('value' in c ? c.value : ''))).toEqual(['clear4', 'tspin2', 'b2b', 'perfectClear', 'gameOver']);
  });
});
