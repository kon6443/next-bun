/**
 * 측정용 고정 길이 표본 — 평균·p95·최대 (할당 없이 링 버퍼)
 */
export class RollingStats {
  private readonly samples: Float64Array;
  private size = 0;
  private cursor = 0;
  private readonly sorted: Float64Array;

  constructor(capacity = 600) {
    this.samples = new Float64Array(capacity);
    this.sorted = new Float64Array(capacity);
  }

  push(value: number): void {
    this.samples[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.samples.length;
    if (this.size < this.samples.length) this.size += 1;
  }

  get count(): number {
    return this.size;
  }

  summary(): { avg: number; p95: number; max: number } {
    if (this.size === 0) return { avg: 0, p95: 0, max: 0 };
    let sum = 0;
    for (let i = 0; i < this.size; i++) {
      sum += this.samples[i];
      this.sorted[i] = this.samples[i];
    }
    const view = this.sorted.subarray(0, this.size).sort();
    return { avg: sum / this.size, p95: view[Math.min(this.size - 1, Math.floor(this.size * 0.95))], max: view[this.size - 1] };
  }

  reset(): void {
    this.size = 0;
    this.cursor = 0;
  }
}
