// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetSoundSettingsForTests, saveSoundSettings } from "@/app/games/_shared/lib/soundSettings";
import { unlockSounds } from "@/app/games/_shared/lib/soundUnlock";
import { MAX_CUES_PER_CALL, MAX_SFX_VOICES, createFortressSound, orderCues, type FortressSoundPlayer } from "./player";
import { type FortressCue, musicStep, recipeFor } from "./recipes";

/** 호출 수만 세는 가짜 AudioContext(테트리스 soundPlayer.test와 같은 방식) */
function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const source = () => ({ ...node(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) });
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state: "suspended" as AudioContextState,
    destination: node(),
    onstatechange: null as null | (() => void),
    createGain: vi.fn(() => ({ ...node(), gain: param() })),
    createOscillator: vi.fn(() => ({ ...source(), type: "sine", frequency: param(), detune: param() })),
    createBufferSource: vi.fn(() => ({ ...source(), buffer: null, loop: false })),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: "lowpass", frequency: param(), Q: param() })),
    createBuffer: vi.fn((_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) })),
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
    suspend: vi.fn(async () => {
      ctx.state = "suspended";
    }),
    close: vi.fn(async () => {
      ctx.state = "closed";
    }),
  };
  return ctx;
}
type Fake = ReturnType<typeof fakeContext>;
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const primes = (c: Fake) => c.createBuffer.mock.calls.filter(([, len]) => len === 1).length;
const sources = (c: Fake) => c.createOscillator.mock.calls.length + c.createBufferSource.mock.calls.length - primes(c);

describe("포트리스 소리 플레이어 (D-025 보충 6)", () => {
  let fake: Fake;
  let createContext: ReturnType<typeof vi.fn<() => AudioContext | null>>;
  let clock: number;
  let player: FortressSoundPlayer;
  let vis: { hidden: boolean; handler: (() => void) | null; addEventListener: Document["addEventListener"]; removeEventListener: Document["removeEventListener"] };
  const target = new EventTarget();

  beforeEach(() => {
    window.localStorage.clear();
    __resetSoundSettingsForTests();
    fake = fakeContext();
    createContext = vi.fn(() => fake as unknown as AudioContext);
    clock = 0;
    vis = {
      hidden: false,
      handler: null,
      addEventListener: ((_t: string, h: () => void) => {
        vis.handler = h;
      }) as unknown as Document["addEventListener"],
      removeEventListener: (() => {
        vis.handler = null;
      }) as unknown as Document["removeEventListener"],
    };
    player = createFortressSound({ createContext, now: () => clock, eventTarget: target, visibilityTarget: vis });
  });
  afterEach(() => player.dispose());

  const start = async () => {
    saveSoundSettings({ sfx: true, music: true });
    target.dispatchEvent(new Event("click"));
    await flush();
  };

  it("설정이 모두 꺼져 있으면(기본) 조작이 와도 AudioContext를 만들지 않는다", () => {
    target.dispatchEvent(new Event("click"));
    player.play({ kind: "fire", weapon: "shell" });
    expect(createContext).not.toHaveBeenCalled();
  });

  it("켜고 사용자 조작 뒤에만 울린다 — 신호의 voice 수만큼 소스를 만든다", async () => {
    saveSoundSettings({ sfx: true });
    player.play({ kind: "fire", weapon: "shell" });
    expect(createContext).not.toHaveBeenCalled();
    target.dispatchEvent(new Event("click"));
    await flush();
    const before = sources(fake);
    player.play({ kind: "fire", weapon: "shell" });
    expect(sources(fake) - before).toBe(recipeFor({ kind: "fire", weapon: "shell" }).voices.length);
  });

  it("공통 소리 모달의 켜는 클릭(unlockSounds)으로도 깨운다", async () => {
    saveSoundSettings({ sfx: true });
    unlockSounds();
    await flush();
    expect(fake.state).toBe("running");
  });

  it("한 번에 몰린 신호는 중요한 것부터 MAX_CUES_PER_CALL개만 — 리플레이 따라잡기에 소리가 몰리지 않게", async () => {
    await start();
    player.setMusic(null);
    const cues: FortressCue[] = [
      { kind: "button" },
      { kind: "weapon" },
      { kind: "hit", amount: 10 },
      { kind: "explode", weapon: "shell", radius: 36 },
      { kind: "explode", weapon: "mega", radius: 90 },
      { kind: "death" },
      { kind: "turn" },
    ];
    const ordered = orderCues(cues);
    expect(ordered[0].kind).toBe("death");
    expect(ordered[1]).toMatchObject({ kind: "explode", radius: 90 });
    const before = sources(fake);
    player.playCues(cues);
    // 같은 종류(두 번째 폭발)는 쓰로틀로 건너뛰고, 울린 신호가 상한(4)에 닿으면 나머지(무기·버튼)는 버린다
    const played = ordered.filter((c, i) => ordered.findIndex((x) => x.kind === c.kind) === i).slice(0, MAX_CUES_PER_CALL);
    expect(played.map((c) => c.kind)).toEqual(["death", "explode", "hit", "turn"]);
    const expected = played.reduce((n, c) => n + recipeFor(c).voices.length, 0);
    expect(sources(fake) - before).toBe(Math.min(expected, MAX_SFX_VOICES));
  });

  it("같은 종류는 쓰로틀 간격 안에서 다시 울리지 않는다", async () => {
    await start();
    player.setMusic(null);
    const before = sources(fake);
    player.play({ kind: "weapon" });
    player.play({ kind: "weapon" });
    expect(sources(fake) - before).toBe(recipeFor({ kind: "weapon" }).voices.length);
    clock += 1000;
    player.play({ kind: "weapon" });
    expect(sources(fake) - before).toBe(recipeFor({ kind: "weapon" }).voices.length * 2);
  });

  it("배경음은 설정이 켜져 있을 때만, 탭이 숨겨지면 멈추고 돌아오면 다시", async () => {
    vi.useFakeTimers();
    try {
      await start();
      player.setMusic("match");
      expect(player.musicTrack()).toBe("match");
      vis.hidden = true;
      vis.handler?.();
      expect(player.musicTrack()).toBeNull();
      player.play({ kind: "fire", weapon: "shell" });
      vis.hidden = false;
      vis.handler?.();
      expect(player.musicTrack()).toBe("match");
      saveSoundSettings({ music: false });
      expect(player.musicTrack()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("탭이 숨겨진 동안 효과음은 버린다", async () => {
    await start();
    player.setMusic(null);
    vis.hidden = true;
    vis.handler?.();
    const before = sources(fake);
    player.play({ kind: "death" });
    expect(sources(fake)).toBe(before);
  });
});

describe("레시피", () => {
  it("폭발은 클수록 길다(메가탄 > 대형탄 > 포탄)", () => {
    const len = (r: number) => Math.max(...recipeFor({ kind: "explode", weapon: "shell", radius: r }).voices.map((v) => v.start + v.duration));
    expect(len(90)).toBeGreaterThan(len(56));
    expect(len(56)).toBeGreaterThan(len(36));
  });
  it("배경음 스텝은 16으로 돈다", () => {
    expect(musicStep("match", 3)).toEqual(musicStep("match", 19));
    expect(musicStep("result", 1)).toEqual([]);
  });
});
