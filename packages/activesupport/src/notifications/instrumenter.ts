import { ArgumentError, Process } from "@blazetrails/ruby-compat";
import { getCrypto } from "../crypto-adapter.js";

export type EventPayload = Record<string, unknown>;

/**
 * Mirrors ActiveSupport::Notifications::Event (instrumenter.rb:104-228).
 *
 * `start` and `ending` are Ruby Times, i.e. float SECONDS — `Time#to_f` — and
 * are held internally as float milliseconds in `@time`/`@end`, exactly as
 * instrumenter.rb:110,114 does.
 */
export class Event {
  readonly name: string;
  readonly transactionId: string;
  // Writable, mirroring Rails' `attr_accessor :payload`: the event is built with
  // a dup, then finish! replaces it with the final payload object (below).
  payload: EventPayload;
  private _time: number | null;
  private _end: number | null;
  private _cpuTimeStart = 0.0;
  private _cpuTimeFinish = 0.0;
  private _gcTimeStart = 0;
  private _gcTimeFinish = 0;

  constructor(
    name: string,
    start: number | null,
    ending: number | null,
    transactionId: string,
    payload: EventPayload,
  ) {
    this.name = name;
    // Rails' Event#initialize does `@payload = payload.dup` (a shallow copy):
    // the event holds a snapshot until finish replaces it with the final
    // payload object (Fanout's EventObjectGroup#finish: `@event.payload = payload`).
    this.payload = { ...payload };
    this._time = start != null ? start * 1_000.0 : start;
    this.transactionId = transactionId;
    this._end = ending != null ? ending * 1_000.0 : ending;
  }

  get time(): number | null {
    return this._time != null ? this._time / 1000.0 : null;
  }

  get end(): number | null {
    return this._end != null ? this._end / 1000.0 : null;
  }

  /** Mirrors: Notifications::Event#record (notifications/instrumenter.rb:132-143). */
  record<T = void>(fn?: (payload: EventPayload) => T): T {
    this.startBang();
    try {
      return fn ? fn(this.payload) : (undefined as unknown as T);
    } catch (e) {
      _recordException(this.payload, e);
      throw e;
    } finally {
      this.finishBang();
    }
  }

  /**
   * trails splits Ruby's one blocking `Event#record` into a sync and an awaiting
   * form, as it does for `Notifications.instrument` / `instrumentAsync`
   * (instrumenter.rb:59-67).
   *
   * @internal
   * @noRailsEquivalent PERMANENT Ruby's `Event#record` (instrumenter.rb:132-143) is
   * blocking, so one method covers both cases; an awaited block needs its own arm.
   */
  async recordAsync<T = void>(fn?: (payload: EventPayload) => Promise<T>): Promise<T> {
    this.startBang();
    try {
      return fn ? await fn(this.payload) : (undefined as unknown as T);
    } catch (e) {
      _recordException(this.payload, e);
      throw e;
    } finally {
      this.finishBang();
    }
  }

  /** Record information at the time this event starts */
  startBang(): void {
    this._time = this.now();
    this._cpuTimeStart = this.nowCpu();
    this._gcTimeStart = this.nowGc();
  }

  /** Record information at the time this event finishes */
  finishBang(): void {
    this._cpuTimeFinish = this.nowCpu();
    this._gcTimeFinish = this.nowGc();
    this._end = this.now();
  }

  /**
   * Returns the CPU time (in milliseconds) passed between the call to
   * #startBang and the call to #finishBang.
   */
  get cpuTime(): number {
    return this._cpuTimeFinish - this._cpuTimeStart;
  }

  /**
   * Returns the idle time time (in milliseconds) passed between the call to
   * #startBang and the call to #finishBang.
   */
  get idleTime(): number {
    const diff = this.duration - this.cpuTime;
    return diff > 0.0 ? diff : 0.0;
  }

  /**
   * Returns the time spent in GC (in milliseconds) between the call to
   * #startBang and the call to #finishBang.
   */
  get gcTime(): number {
    return (this._gcTimeFinish - this._gcTimeStart) / 1_000_000.0;
  }

  /**
   * Returns the difference in milliseconds between when the execution of the
   * event started and when it ended.
   *
   *   Notifications.subscribe("wait", (event) => { theEvent = event; });
   *
   *   Notifications.instrument("wait", {}, () => sleep(1));
   *
   *   theEvent.duration // => 1000.138
   */
  get duration(): number {
    return this._end! - this._time!;
  }

  /** instrumenter.rb:196-198 — `Process.clock_gettime(CLOCK_MONOTONIC, :float_millisecond)`. */
  private now(): number {
    return Process.clockGettime(Process.CLOCK_MONOTONIC, ":float_millisecond");
  }

  /**
   * instrumenter.rb:200-211 — Ruby defines `now_cpu` from CLOCK_THREAD_CPUTIME_ID
   * and falls back to the `0.0` arm on platforms without that clock. JS has no
   * thread CPU clock at all (`performance.now()` is a wall clock, not CPU time),
   * so this is Rails' own fallback arm, not a stub of the first one.
   */
  private nowCpu(): number {
    return 0.0;
  }

  /**
   * instrumenter.rb:218-225 — Ruby defines `now_gc` from `GC.total_time` and
   * falls back to the `0` arm on a build without it. JS exposes no GC clock at
   * all, so this is Rails' own fallback arm, not a stub of the first one.
   */
  private nowGc(): number {
    return 0;
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
  if (e instanceof Error) {
    if (e.name && e.name !== "Error") return e.name;
    const ctor = e.constructor?.name;
    if (ctor && ctor !== "Error") return ctor;
    return e.name || ctor || "Error";
  }
  // JS can throw a non-Error; Ruby cannot, so there's no `e.class.name` analogue.
  // Use the value's constructor name where it has one ("bare string" -> String),
  // and fall back to "Error" for the constructor-less throws (null/undefined).
  return (e as { constructor?: { name?: string } })?.constructor?.name ?? "Error";
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
  start?(name: string, id: unknown, payload: EventPayload): void;
  finish?(name: string, id: unknown, payload: EventPayload, listenersState?: unknown): void;
}

/** The low-level start/finish handle returned by `buildHandle`. */
export interface NotificationHandle {
  start(): void;
  finish(): void;
}

export class Instrumenter {
  private _notifier: InstrumenterNotifier;
  readonly id: string;

  constructor(notifier: InstrumenterNotifier) {
    this._notifier = notifier;
    this.id = this.uniqueId();
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
      return fn ? fn(payload) : (undefined as unknown as T);
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
      return await (fn ? fn(payload) : Promise.resolve(undefined as unknown as T));
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
    return new Handle(
      name,
      payload,
      this.id,
      this._notifier as InstrumenterNotifier & {
        publish(name: string, event: Event): void;
      },
    );
  }

  /** Mirrors: Instrumenter#new_event (instrumenter.rb:82-84). */
  newEvent(name: string, payload: EventPayload = {}): Event {
    return new Event(name, null, null, this.id, payload);
  }

  /** Send a start notification with +name+ and +payload+ (instrumenter.rb:86-88). */
  start(name: string, payload: EventPayload): void {
    this._notifier.start?.(name, this.id, payload);
  }

  /** Send a finish notification with +name+ and +payload+ (instrumenter.rb:91-93). */
  finish(name: string, payload: EventPayload): void {
    this._notifier.finish?.(name, this.id, payload);
  }

  /** instrumenter.rb:96-98 — send a finish notification carrying listener state. */
  finishWithState(listenersState: unknown, name: string, payload: EventPayload): void {
    this._notifier.finish?.(name, this.id, payload, listenersState);
  }

  /**
   * instrumenter.rb:100-102 — `SecureRandom.hex(10)`. Goes through the
   * `CryptoAdapter` seam, so a host that installs its own adapter keeps it
   * here as at every other call site.
   */
  private uniqueId(): string {
    return getCrypto().randomBytes(10).toString("hex");
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

  start(): void {
    if (this._state !== "initialized") {
      throw new ArgumentError(`expected state to be "initialized" but was "${this._state}"`);
    }
    this._state = "started";
    this._event = new Event(this._name, null, null, this._transactionId, this._payload);
    this._event.startBang();
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
      this._event.finishBang();
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
    this._event.finishBang();
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
