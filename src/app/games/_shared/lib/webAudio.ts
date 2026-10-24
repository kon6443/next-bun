/**
 * WebAudio 공통 조각 — 테트리스 소리 플레이어·디펜스 효과음이 같이 쓴다 (games-polish FE-56)
 * 켜는 시점·제스처 대기 전략은 게임마다 달라 각자 둔다. 여기는 동작이 같은 부분만
 */

/** 옛 iOS Safari는 접두어가 붙은 생성자만 있다 */
type GlobalWithAudio = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };

/** 오디오를 막은 브라우저·기기는 생성에서 던질 수 있다 — 미지원·실패면 null(소리 없이 계속) */
export function createAudioContext(): AudioContext | null {
  try {
    const w = globalThis as GlobalWithAudio;
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}

/** 흰 노이즈 버퍼(모노) — 폭발·명중·타악 음색이 필터를 걸어 쓴다 */
export function createNoiseBuffer(ctx: AudioContext, seconds = 0.5): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** 다시 켜야 하는 상태 — iOS는 전화·다른 앱 소리로 'interrupted'가 된다. running·closed가 아니면 모두 멈춘 것으로 본다 */
export function isAudioHalted(ctx: AudioContext): boolean {
  return ctx.state !== 'running' && ctx.state !== 'closed';
}
