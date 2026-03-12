/**
 * ActiveSupport::Notifications — instrumentation API mirroring Rails.
 *
 * Usage:
 *   const sub = Notifications.subscribe("sql.active_record", (event) => { ... });
 *   Notifications.instrument("sql.active_record", { sql: "SELECT 1" }, () => { ... });
 *   Notifications.unsubscribe(sub);
 */

export type EventPayload = Record<string, unknown>;

export type NotificationSubscriber = {
  readonly pattern: string | RegExp | null;
  readonly callback: (event: Event) => void;
};

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

  constructor(name: string, start: Date, payload: EventPayload = {}) {
    this.name = name;
    this.time = start;
    this.end = null;
    this.payload = payload;
    this.transactionId = generateTransactionId();
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

type Subscriber = {
  pattern: string | RegExp | null;
  callback: (event: Event) => void;
};

/**
 * ActiveSupport::Notifications — global instrumentation hub.
 *
 * Unlike Rails, this is a static singleton class rather than a module.
 */
export class Notifications {
  private static _subscribers: Set<Subscriber> = new Set();
  private static _eventStack: Event[] = [];

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to events matching `pattern`.
   * - string: exact name match
   * - RegExp: regex match against name
   * - null/omitted: all events
   */
  static subscribe(
    pattern: string | RegExp | null | undefined,
    callback: (event: Event) => void,
  ): NotificationSubscriber {
    const sub: Subscriber = { pattern: pattern ?? null, callback };
    this._subscribers.add(sub);
    return sub as NotificationSubscriber;
  }

  /** Subscribe and automatically unsubscribe after the first matching event. */
  static subscribeOnce(
    pattern: string | RegExp | null | undefined,
    callback: (event: Event) => void,
  ): NotificationSubscriber {
    let sub: Subscriber;
    const wrapped = (event: Event) => {
      this._subscribers.delete(sub);
      callback(event);
    };
    sub = { pattern: pattern ?? null, callback: wrapped };
    this._subscribers.add(sub);
    return sub as NotificationSubscriber;
  }

  /** Remove a previously registered subscriber. */
  static unsubscribe(subscriber: NotificationSubscriber): void {
    this._subscribers.delete(subscriber as Subscriber);
  }

  /** Remove all subscribers. Useful in tests. */
  static unsubscribeAll(): void {
    this._subscribers.clear();
  }

  // -------------------------------------------------------------------------
  // Instrumentation
  // -------------------------------------------------------------------------

  /**
   * instrument(name, payload?, block?) — fire an event, optionally wrapping a block.
   *
   * Synchronous form:
   *   const result = Notifications.instrument("render", { view: "index" }, () => renderView());
   *
   * Fire-and-forget (no block):
   *   Notifications.instrument("cache.miss", { key });
   */
  static instrument<T>(
    name: string,
    payload?: EventPayload,
    block?: () => T,
  ): T extends undefined ? void : T {
    const event = new Event(name, new Date(), payload ?? {});

    // Track nesting for child events
    const parent = this._eventStack[this._eventStack.length - 1];
    if (parent) {
      parent.children.push(event);
    }

    if (!block) {
      event.finish();
      this._notify(event);
      return undefined as any;
    }

    this._eventStack.push(event);
    let result: T;
    try {
      result = block();
    } finally {
      this._eventStack.pop();
      event.finish();
      this._notify(event);
    }
    return result as any;
  }

  /**
   * instrumentAsync — like instrument but for async blocks.
   */
  static async instrumentAsync<T>(
    name: string,
    payload?: EventPayload,
    block?: () => Promise<T>,
  ): Promise<T extends undefined ? void : T> {
    const event = new Event(name, new Date(), payload ?? {});

    const parent = this._eventStack[this._eventStack.length - 1];
    if (parent) {
      parent.children.push(event);
    }

    if (!block) {
      event.finish();
      this._notify(event);
      return undefined as any;
    }

    this._eventStack.push(event);
    let result: T;
    try {
      result = await block();
    } finally {
      this._eventStack.pop();
      event.finish();
      this._notify(event);
    }
    return result as any;
  }

  /**
   * publish — fire an event without instrumenting a block.
   * Mirrors ActiveSupport::Notifications.publish.
   */
  static publish(name: string, payload?: EventPayload): void {
    this.instrument(name, payload);
  }

  // -------------------------------------------------------------------------
  // Monitoring helpers
  // -------------------------------------------------------------------------

  /**
   * Collect all events matching pattern during the block, then return them.
   * Useful in tests — mirrors Rails' AS::Notifications test helpers.
   */
  static collectEvents(pattern: string | RegExp | null | undefined, block: () => void): Event[] {
    const events: Event[] = [];
    const sub = this.subscribe(pattern, (e) => events.push(e));
    try {
      block();
    } finally {
      this.unsubscribe(sub);
    }
    return events;
  }

  static async collectEventsAsync(
    pattern: string | RegExp | null | undefined,
    block: () => Promise<void>,
  ): Promise<Event[]> {
    const events: Event[] = [];
    const sub = this.subscribe(pattern, (e) => events.push(e));
    try {
      await block();
    } finally {
      this.unsubscribe(sub);
    }
    return events;
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private static _notify(event: Event): void {
    for (const sub of this._subscribers) {
      if (this._matches(sub.pattern, event.name)) {
        try {
          sub.callback(event);
        } catch {
          // Swallow subscriber errors — matches Rails behavior
        }
      }
    }
  }

  private static _matches(pattern: string | RegExp | null, name: string): boolean {
    if (pattern === null) return true;
    if (typeof pattern === "string") return pattern === name;
    return pattern.test(name);
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

let _txCounter = 0;
function generateTransactionId(): string {
  return `tx-${Date.now()}-${(++_txCounter).toString(36)}`;
}
