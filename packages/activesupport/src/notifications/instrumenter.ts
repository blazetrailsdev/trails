import { Temporal } from "../temporal.js";
import { IsolatedExecutionState } from "../isolated-execution-state.js";

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

/**
 * Rails' `e.class.name`. trails carries the namespaced Rails name on `name`
 * where it has been ported (`ActionDispatch::ParamError`, param-error.ts:28),
 * which is what keys `rescue_responses` — so prefer it and fall back to the
 * constructor, mirroring ExceptionWrapper's classNameOf (exception-wrapper.ts:75).
 * Errors that never got a namespaced name (AR's, today) degrade to the bare one.
 */
function _classNameOf(e: unknown): string {
  if (e === null || e === undefined) return "NilClass";
  if (e instanceof Error) {
    if (e.name && e.name !== "Error") return e.name;
    const ctor = e.constructor?.name;
    if (ctor && ctor !== "Error") return ctor;
    return e.name || ctor || "Error";
  }
  // Ruby cannot `raise` a non-Exception, so this branch has no Rails analogue;
  // name it the way Rails would name the object's class anyway.
  return (e as { constructor?: { name?: string } })?.constructor?.name ?? typeof e;
}

// Rails' `rescue Exception` arm — subscribers (e.g. ExplainSubscriber) key off
// these to detect a failed event.
function _recordException(payload: EventPayload, e: unknown): void {
  payload.exception = [_classNameOf(e), e instanceof Error ? e.message : String(e)];
  payload.exception_object = e;
}

/**
 * The notifier an Instrumenter publishes through. A full notifier (Fanout)
 * additionally exposes `buildHandle`, which snapshots the listener groups;
 * a legacy publish-only notifier does not, and gets wrapped (see below).
 */
export interface InstrumenterNotifier {
  // A full notifier (Fanout) drives events through `buildHandle`; a legacy
  // publish-only notifier provides `publish` and gets wrapped. One is required.
  publish?(name: string, event: Event): void;
  buildHandle?(name: string, id: unknown, payload: EventPayload): NotificationHandle;
}

/** The low-level start/finish handle returned by `buildHandle`. */
export interface NotificationHandle {
  start(): void;
  finish(): void;
  /** The Event this handle built (if any) — used to thread child-event nesting. */
  readonly event?: Event | null;
}

export class Instrumenter {
  private _notifier: InstrumenterNotifier;
  // trails' (non-Rails) child-event nesting stack. Rails keeps no such stack on
  // the Instrumenter; trails threads `Event#children` here. It lives in
  // AsyncContext (per-instance key), so concurrent `instrumentAsync` calls
  // racing under `Promise.all` fork their own view and can't pop each other's
  // entries — an instance array would interleave and collapse the nesting.
  private readonly _stackKey = Symbol("as_notification_instrumenter_stack");
  readonly id: string;

  constructor(notifier: InstrumenterNotifier) {
    this._notifier = notifier;
    this.id = generateTransactionId();
  }

  private _stack(): Event[] {
    return IsolatedExecutionState.fetch<Event[]>(this._stackKey, () => []);
  }

  /**
   * Mirrors ActiveSupport::Notifications::Instrumenter#instrument
   * (instrumenter.rb:54-65): build a handle, start it, yield the raw payload
   * (the rescue arm records the exception on it), then finish the handle in the
   * `ensure`. Routing through `build_handle` is what lets a Fanout notifier's
   * groups drive the event, rather than open-coding an Event/publish here. The
   * handle's event is linked under the enclosing one and pushed for the block's
   * duration, so nested instruments become children.
   */
  instrument<T = void>(
    name: string,
    payload: EventPayload = {},
    fn?: (payload: EventPayload) => T,
  ): T {
    const handle = this.buildHandle(name, payload);
    handle.start();
    const inner = this._nest(handle.event ?? null);

    try {
      return IsolatedExecutionState.scope(this._stackKey, inner, () =>
        fn ? fn(payload) : (undefined as unknown as T),
      );
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
    const inner = this._nest(handle.event ?? null);

    try {
      return await IsolatedExecutionState.scope(this._stackKey, inner, () =>
        fn ? fn(payload) : Promise.resolve(undefined as unknown as T),
      );
    } catch (e) {
      _recordException(payload, e);
      throw e;
    } finally {
      handle.finish();
    }
  }

  // Link `event` under the currently-open one and return the stack the block
  // should run in (with `event` pushed). A handle with no event-object group
  // (nothing listening) leaves the stack unchanged.
  private _nest(event: Event | null): Event[] {
    const stack = this._stack();
    if (!event) return stack;
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(event);
    return [...stack, event];
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
    return new Handle(
      name,
      payload,
      this.id,
      this._notifier as InstrumenterNotifier & {
        publish(name: string, event: Event): void;
      },
    );
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
  ) {}

  /** The Event built at #start — the Instrumenter threads nesting through it. */
  get event(): Event | null {
    return this._event;
  }

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
