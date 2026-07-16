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
  // Writable, mirroring Rails' `attr_accessor :payload`: the event is built with
  // a dup, then finish replaces it with the final payload object (below).
  payload: EventPayload;
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
    // Rails' Event#initialize does `@payload = payload.dup` (a shallow copy):
    // the event holds a snapshot until finish replaces it with the final
    // payload object (Fanout's EventObjectGroup#finish: `@event.payload = payload`).
    this.payload = { ...payload };
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

/**
 * The notifier an Instrumenter publishes through. A full notifier (Fanout)
 * additionally exposes `buildHandle`, which snapshots the listener groups;
 * a legacy publish-only notifier does not, and gets wrapped (see below).
 */
export interface InstrumenterNotifier {
  publish(name: string, event: Event): void;
  buildHandle?(name: string, id: unknown, payload: EventPayload): NotificationHandle;
}

/** The low-level start/finish handle returned by `buildHandle`. */
export interface NotificationHandle {
  start(): void;
  finish(): void;
}

export class Instrumenter {
  private _notifier: InstrumenterNotifier;
  private _stack: Handle[] = [];
  readonly id: string;

  constructor(notifier: InstrumenterNotifier) {
    this._notifier = notifier;
    this.id = generateTransactionId();
  }

  /**
   * Mirrors ActiveSupport::Notifications::Instrumenter#instrument
   * (instrumenter.rb:54-65): build a handle, start it, yield the raw payload
   * (the rescue arm records the exception on it), then finish the handle in the
   * `ensure`. Routing through `build_handle` is what lets a Fanout notifier's
   * groups drive the event, rather than open-coding an Event/publish here.
   */
  instrument<T = void>(
    name: string,
    payload: EventPayload = {},
    fn?: (payload: EventPayload) => T,
  ): T {
    const handle = this.buildHandle(name, payload);
    handle.start();

    try {
      if (fn) return fn(payload);
      return undefined as unknown as T;
    } catch (e) {
      _recordException(payload, e);
      throw e;
    } finally {
      handle.finish();
    }
  }

  async instrumentAsync<T = void>(
    name: string,
    payload: EventPayload = {},
    fn?: (payload: EventPayload) => Promise<T>,
  ): Promise<T> {
    const handle = this.buildHandle(name, payload);
    handle.start();

    try {
      if (fn) return await fn(payload);
      return undefined as unknown as T;
    } catch (e) {
      _recordException(payload, e);
      throw e;
    } finally {
      handle.finish();
    }
  }

  /**
   * Mirrors ActiveSupport::Notifications::Instrumenter#build_handle
   * (instrumenter.rb:78-80): `@notifier.build_handle(name, @id, payload)`. A
   * full notifier (Fanout) builds the handle itself, snapshotting its listener
   * groups (fanout.rb:230, :322-324); a legacy publish-only notifier has no
   * `build_handle`, so — like Rails' `LegacyHandle::Wrapper` (instrumenter.rb:
   * 13-15, 20-47) — we wrap it in a Handle that builds the Event at start and
   * publishes it at finish. `#start`/`#finish` must each be called exactly once.
   */
  buildHandle(name: string, payload: EventPayload = {}): NotificationHandle {
    if (this._notifier.buildHandle) {
      return this._notifier.buildHandle(name, this.id, payload);
    }
    // The stack threads trails' (non-Rails) child-event nesting through the
    // wrapped handles: each links its event under the one still open above it.
    return new Handle(name, payload, this.id, this._notifier, this._stack);
  }
}

/**
 * Mirrors ActiveSupport::Notifications::Fanout::Handle — builds the Event at
 * `#start` (so its start time is the real start of the work) and publishes it
 * at `#finish`, replacing the event's payload with the final object first.
 */
export class Handle implements NotificationHandle {
  private _state: "initialized" | "started" | "finished" = "initialized";
  private _event: Event | null = null;

  constructor(
    private _name: string,
    private _payload: EventPayload,
    private _transactionId: string,
    private _notifier: { publish(name: string, event: Event): void },
    // Optional nesting stack for trails' child-event tracking (see Instrumenter).
    private _stack?: Handle[],
  ) {}

  start(): void {
    if (this._state !== "initialized") {
      throw new ArgumentError(`expected state to be "initialized" but was "${this._state}"`);
    }
    this._state = "started";
    this._event = new Event(this._name, Temporal.Now.instant(), this._payload, this._transactionId);
    if (this._stack) {
      const parent = this._stack[this._stack.length - 1];
      if (parent?._event) parent._event.children.push(this._event);
      this._stack.push(this);
    }
  }

  finish(): void {
    if (this._state !== "started") {
      throw new ArgumentError(`expected state to be "started" but was "${this._state}"`);
    }
    this._state = "finished";
    if (this._stack) this._stack.pop();
    if (this._event) {
      // Replace the event's dup with the final payload object (mutations made
      // between start and finish, e.g. payload.outcome), as Rails'
      // EventObjectGroup#finish does.
      this._event.payload = this._payload;
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
