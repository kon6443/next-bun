/**
 * 채팅 전송 대기열 (D-025)
 *
 * 서버는 같은 소켓의 이벤트를 동시에 처리해서, 연달아 보내면 저장 ID 순서가 보낸 순서와 달라진다.
 * 그래서 한 번에 1건만 보내고, 그 1건의 결과(echo·에러·타임아웃)를 받은 뒤 다음 건을 보낸다.
 *
 * - 보낼 수 없는 상태(끊김·room 참가 전)면 send가 false를 돌려주고, 대기열은 그대로 기다린다.
 *   room에 다시 참가하면 호출부가 pump()를 부른다.
 * - 진행 중이던 1건이 끊김으로 결과를 못 받으면 abandonInFlight()로 내려놓는다.
 *   중복 저장 위험 때문에 자동 재전송하지 않는다 (저장 여부는 호출부의 보정 판정이 정한다).
 */

export interface ChatOutboxItem {
  clientMsgId: string;
  message: string;
}

export interface ChatOutboxOptions {
  /** 실제 emit. 보낼 수 없으면 false (끊김·room 참가 전) */
  send: (item: ChatOutboxItem) => boolean;
  /** 진행 중인 1건이 timeoutMs 안에 결과를 못 받았을 때 */
  onTimeout: (clientMsgId: string) => void;
  timeoutMs: number;
}

export class ChatOutbox {
  private queue: ChatOutboxItem[] = [];
  private inFlight: ChatOutboxItem | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: ChatOutboxOptions) {}

  /** 대기열 끝에 넣고 보낼 수 있으면 보낸다 */
  enqueue(item: ChatOutboxItem): void {
    this.queue.push(item);
    this.pump();
  }

  /** 진행 중인 건이 없으면 맨 앞 1건을 보낸다 */
  pump(): void {
    if (this.inFlight || this.queue.length === 0) return;
    const item = this.queue[0];
    if (!this.options.send(item)) return;
    this.queue.shift();
    this.inFlight = item;
    this.timer = setTimeout(() => {
      if (this.inFlight !== item) return;
      this.inFlight = null;
      this.timer = null;
      this.options.onTimeout(item.clientMsgId);
      this.pump();
    }, this.options.timeoutMs);
  }

  /**
   * 진행 중인 건의 결과(echo 또는 에러)를 받았다 — 다음 건으로 넘어간다.
   * @returns 진행 중인 건과 일치했으면 true
   */
  settle(clientMsgId: string): boolean {
    if (this.inFlight?.clientMsgId !== clientMsgId) return false;
    this.clearTimer();
    this.inFlight = null;
    this.pump();
    return true;
  }

  /**
   * 끊김: 진행 중인 건을 내려놓는다 (재전송하지 않음). 대기 중인 건은 그대로 남아 다시 참가하면 보낸다.
   * @returns 결과를 못 받은 진행 중 건의 clientMsgId
   */
  abandonInFlight(): string | null {
    const abandoned = this.inFlight?.clientMsgId ?? null;
    this.clearTimer();
    this.inFlight = null;
    return abandoned;
  }

  /** 아직 보내지 않은 건 + 진행 중인 건 수 */
  get size(): number {
    return this.queue.length + (this.inFlight ? 1 : 0);
  }

  dispose(): void {
    this.clearTimer();
    this.queue = [];
    this.inFlight = null;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
