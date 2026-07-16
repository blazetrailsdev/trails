import { Temporal } from "../temporal.js";

export type EventPayload = Record<string, unknown>;

// Rails' Fanout::Handle#ensure_state! raises ArgumentError (fanout.rb:263-267).
class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

let _txCounter = 0;
function generateTransactionId(): string {
  return `tx-${Date.now()}-${(++_txCounter).toString(36)}`;
}

/**
 * Mirrors ActiveSupport::Notifications::Event.
 */
export class Event {
  readonly name: string;
  readonly time: Temporal.Instant;
  end: Temporal.Instant | null;
  readonly payload: EventPayload;
  readonly transactionId: string;
  readonly children: Event[];

  constructor(
    name: string,
    start: Temporal.Instant,
    payload: EventPayload = {},
    transactionId?: string,
  ) {
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
    return this.end.epochMilliseconds - this.time.epochMilliseconds;
  }

  /** Alias: Rails calls it `duration` but measured in ms. */
  durationMs(): number {
    return this.duration;
  }

  finish(endTime?: Temporal.Instant): void {
    this.end = endTime ?? Temporal.Now.instant();
  }
}

// Rails' `rescue Exception` arm — subscribers (e.g. ExplainSubscriber) key off
// these to detect a failed event.
function _recordException(payload: EventPayload, e: unknown): void {
  const error = e as { constructor?: { name?: string }; message?: unknown };
  payload.exception = [error?.constructor?.name ?? "Error", String(error?.message ?? e)];
  payload.exception_object = e;
}

export class Instrumenter {
  private _notifier: { publish(name: string, event: Event): void };
  private _stack: Event[] = [];
  readonly id: string;

  constructor(notifier: { publish(name: string, event: Event): void }) {
    this._notifier = notifier;
    this.id = generateTransactionId();
  }

  /**
   * The block receives the payload — the same object passed in, which
   * subscribers read after the block returns. Mutating it is how a caller
   * reports back into the notification, mirroring Rails' `yield payload`.
   */
  instrument<T = void>(
    name: string,
    payload: EventPayload = {},
    fn?: (payload: EventPayload) => T,
  ): T {
    const event = this._push(name, payload);

    try {
      if (fn) return fn(payload);
      return undefined as unknown as T;
    } catch (e) {
      _recordException(payload, e);
      throw e;
    } finally {
      this._pop(event);
    }
  }

  async instrumentAsync<T = void>(
    name: string,
    payload: EventPayload = {},
    fn?: (payload: EventPayload) => Promise<T>,
  ): Promise<T> {
    const event = this._push(name, payload);

    try {
      if (fn) return await fn(payload);
      return undefined as unknown as T;
    } catch (e) {
      _recordException(payload, e);
      throw e;
    } finally {
      this._pop(event);
    }
  }

  /**
   * Mirrors ActiveSupport::Notifications::Instrumenter#build_handle
   * (instrumenter.rb:78-80). Returns a handle that records the event's start at
   * `#start` and publishes it at `#finish`, so a single event carries the span
   * between the two calls. `#start`/`#finish` must each be called exactly once.
   */
  buildHandle(name: string, payload: EventPayload = {}): Handle {
    return new Handle(name, payload, this.id, this._notifier);
  }

  // Rails' #instrument never builds an Event — it hands the raw payload to a
  // Fanout handle, so subscribers see the block's mutations (that is how
  // payload[:exception] reaches them). trails routes it through an Event, which
  // works only because Event holds the payload by reference. Rails' Event#dups
  // it (instrumenter.rb:105); converging that dup without first moving this path
  // off Event would silently hide the exception keys from subscribers.
  private _push(name: string, payload: EventPayload): Event {
    const event = new Event(name, Temporal.Now.instant(), payload, this.id);
    const parent = this._stack[this._stack.length - 1];
    if (parent) parent.children.push(event);
    this._stack.push(event);
    return event;
  }

  private _pop(event: Event): void {
    this._stack.pop();
    event.finish();
    this._notifier.publish(event.name, event);
  }
}

/**
 * Mirrors ActiveSupport::Notifications::Fanout::Handle — builds the Event at
 * `#start` (so its start time is the real start of the work) and publishes it
 * at `#finish`, off the payload held by reference.
 */
export class Handle {
  private _state: "initialized" | "started" | "finished" = "initialized";
  private _event: Event | null = null;

  constructor(
    private _name: string,
    private _payload: EventPayload,
    private _transactionId: string,
    private _notifier: { publish(name: string, event: Event): void },
  ) {}

  start(): void {
    if (this._state !== "initialized") {
      throw new ArgumentError(`expected state to be "initialized" but was "${this._state}"`);
    }
    this._state = "started";
    this._event = new Event(this._name, Temporal.Now.instant(), this._payload, this._transactionId);
  }

  finish(): void {
    if (this._state !== "started") {
      throw new ArgumentError(`expected state to be "started" but was "${this._state}"`);
    }
    this._state = "finished";
    if (this._event) {
      this._event.finish();
      this._notifier.publish(this._event.name, this._event);
    }
  }
}

export class LegacyHandle {
  private _event: Event;
  private _notifier: { publish(name: string, event: Event): void };

  constructor(event: Event, notifier: { publish(name: string, event: Event): void }) {
    this._event = event;
    this._notifier = notifier;
  }

  finish(): void {
    this._event.finish();
    this._notifier.publish(this._event.name, this._event);
  }
}

export class Wrapper {
  private _instrumenter: Instrumenter;

  constructor(notifier: { publish(name: string, event: Event): void }) {
    this._instrumenter = new Instrumenter(notifier);
  }

  get instrumenter(): Instrumenter {
    return this._instrumenter;
  }
}
