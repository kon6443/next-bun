/** 0~1 고정 의사난수(정수 i) — 같은 자리는 같은 모양(프레임마다 흔들리지 않게). 탱크·배경·탄 연출이 함께 쓴다 */
export function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
