export type EventPayload = Record<string, unknown>;

let _txCounter = 0;
function generateTransactionId(): string {
  return `tx-${Date.now()}-${(++_txCounter).toString(36)}`;
}

/**
 * Mirrors ActiveSupport::Notifications::Event.
 */
export class Event {
  readonly name: string;
  readonly time: Date;
  end: Date | null;
  readonly payload: EventPayload;
  readonly transactionId: string;
  readonly children: Event[];

  constructor(name: string, start: Date, payload: EventPayload = {}, transactionId?: string) {
    this.name = name;
    this.time = start;
    this.end = null;
    this.payload = payload;
    this.transactionId = transactionId ?? generateTransactionId();
    this.children = [];
  }

  /** Duration in milliseconds (like Rails' Event#duration in ms). */
  get duration(): number {
    if (!this.end) return 0;
    return this.end.getTime() - this.time.getTime();
  }

  /** Alias: Rails calls it `duration` but measured in ms. */
  durationMs(): number {
    return this.duration;
  }

  finish(endTime?: Date): void {
    this.end = endTime ?? new Date();
  }
}
