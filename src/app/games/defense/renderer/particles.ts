/**
 * 파티클·데미지 숫자 풀 — 고정 용량 SoA(Float32Array), 프레임당 할당 0 (§F10)
 * 가득 차면 돌림 순서로 자리를 덮어쓴다(지울 때 자리를 바꿔 끼우므로 "가장 오래된 것"은 보장하지 않는다). 좌표는 밀리타일, 시간은 ms
 */

export class ParticlePool {
  readonly capacity: number;
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  /** 팔레트 인덱스 (호출자가 정한 색 표) */
  readonly color: Uint8Array;
  /** 가득 찼을 때 덮어쓸 다음 자리 */
  protected cursor = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.color = new Uint8Array(capacity);
  }

  /** 넣은 자리 인덱스를 돌려준다 */
  spawn(x: number, y: number, vx: number, vy: number, lifeMs: number, color: number): number {
    let i: number;
    if (this.count < this.capacity) i = this.count++;
    else {
      i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = lifeMs;
    this.maxLife[i] = lifeMs;
    this.color[i] = color;
    return i;
  }

  /** dt ms만큼 진행 — 다 된 것은 마지막 것과 자리를 바꿔 지운다(순서 무관) */
  update(dtMs: number): void {
    const seconds = dtMs / 1000;
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dtMs;
      if (this.life[i] <= 0) {
        this.move(--this.count, i);
        continue;
      }
      this.x[i] += this.vx[i] * seconds;
      this.y[i] += this.vy[i] * seconds;
      i++;
    }
    if (this.cursor >= this.count) this.cursor = 0;
  }

  /** from 자리 값을 to 자리로 — 하위 풀은 자기 열을 덧붙여 옮긴다 */
  protected move(from: number, to: number): void {
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.color[to] = this.color[from];
  }

  clear(): void {
    this.count = 0;
    this.cursor = 0;
  }
}

/** 데미지 숫자 — 값이 하나 더 있는 작은 풀 (§F10 상한 40) */
export class DamageNumberPool extends ParticlePool {
  readonly value: Int32Array;

  constructor(capacity: number) {
    super(capacity);
    this.value = new Int32Array(capacity);
  }

  /** 위로 떠오르며 사라지는 숫자 */
  spawnNumber(x: number, y: number, value: number, lifeMs: number): void {
    this.value[this.spawn(x, y, 0, -600, lifeMs, 0)] = value;
  }

  protected override move(from: number, to: number): void {
    super.move(from, to);
    this.value[to] = this.value[from];
  }
}
