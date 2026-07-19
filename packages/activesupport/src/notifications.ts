/**
 * ActiveSupport::Notifications — instrumentation API mirroring Rails.
 *
 * Usage:
 *   const sub = Notifications.subscribe("sql.active_record", (event) => { ... });
 *   Notifications.instrument("sql.active_record", { sql: "SELECT 1" }, () => { ... });
 *   Notifications.unsubscribe(sub);
 */

import { Temporal } from "./temporal.js";
import { Event, Instrumenter } from "./notifications/instrumenter.js";
import type { EventPayload, NotificationHandle } from "./notifications/instrumenter.js";
import { Fanout } from "./notifications/fanout.js";

// The concrete subscriber handle the notifier hands back. Kept internal (not the
// public `NotificationSubscriber`) so the `Fanout` subscriber's members don't
// leak into this module's exported API surface.
type FanoutSubscriber = ReturnType<Fanout["subscribe"]>;

declare const notificationSubscriberBrand: unique symbol;
/**
 * Opaque handle returned by `subscribe`; pass it back to `unsubscribe`. Backed
 * by the notifier's `Fanout` subscriber, but exposed as an opaque token.
 */
export type NotificationSubscriber = { readonly [notificationSubscriberBrand]: true };

export type { NotificationHandle };

/**
 * A subscriber callback. Mirrors the two block shapes Rails accepts (see
 * `ActiveSupport::Notifications.subscribe`): a single-arity block receives the
 * built `Event`, while the five-arity block receives `(name, start, finish, id,
 * payload)`. The notifier classifies by arity, so `monotonic` subscribers must
 * be the five-arity form to see monotonic (`number`) start/finish times.
 */
export type NotificationCallback =
  | ((event: Event) => void)
  | ((
      name: string,
      start: Temporal.Instant | number,
      finish: Temporal.Instant | number,
      id: string,
      payload: EventPayload,
    ) => void);

/** The listener shape the underlying `Fanout` notifier accepts. */
type FanoutListener = Parameters<Fanout["subscribe"]>[1];

/**
 * Mirrors ActiveSupport::Notifications::Instrumenter — the object Rails reaches
 * via `ActiveSupport::Notifications.instrumenter`.
 */
export interface NotificationInstrumenter {
  readonly id: string;
  buildHandle(name: string, payload?: EventPayload): NotificationHandle;
}

/**
 * ActiveSupport::Notifications — global instrumentation hub.
 *
 * Unlike Rails, this is a static singleton class rather than a module. It owns
 * a `Fanout` notifier and a single `Instrumenter` bound to it, mirroring Rails'
 * `Notifications.notifier` / `Notifications.instrumenter`.
 */
export class Notifications {
  private static readonly _notifier = new Fanout();
  private static readonly _boundInstrumenter = new Instrumenter(Notifications._notifier);

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to events matching `pattern`.
   * - string: exact name match
   * - RegExp: regex match against name
   * - null/omitted: all events
   *
   * The callback is wrapped so it presents to the `Fanout` as an event-object
   * (single-arity) subscriber, which always receives the built `Event` — trails'
   * public API always yields the Event, regardless of the callback's arity.
   */
  static subscribe(
    pattern: string | RegExp | null | undefined,
    callback: (event: Event) => void,
  ): NotificationSubscriber {
    const sub = this._notifier.subscribe(pattern ?? null, (event: Event) => callback(event));
    return sub as unknown as NotificationSubscriber;
  }

  /**
   * monotonicSubscribe — like `subscribe`, but the notifier records the event's
   * start/finish in monotonic time instead of wall-clock time. Mirrors
   * `ActiveSupport::Notifications.monotonic_subscribe` (notifications.rb:254):
   * `notifier.subscribe(pattern, callback, monotonic: true)`. The callback is
   * forwarded with its arity intact (not wrapped) so a five-arity subscriber is
   * classified as monotonic-timed and receives `number` start/finish times.
   */
  static monotonicSubscribe(
    pattern: string | RegExp | null | undefined,
    callback: NotificationCallback,
  ): NotificationSubscriber {
    const sub = this._notifier.subscribe(pattern ?? null, callback as FanoutListener, true);
    return sub as unknown as NotificationSubscriber;
  }

  /**
   * subscribed — subscribe, run `block`, then unsubscribe in a `finally`.
   * Mirrors `ActiveSupport::Notifications.subscribed` (notifications.rb:258):
   * `subscribe`, `yield`, `ensure unsubscribe`. `pattern` defaults to all events
   * (Rails' `pattern = nil`), so it may be omitted. Unlike Rails, `block` may be
   * async and its result is awaited/returned.
   */
  static subscribed<T>(
    callback: NotificationCallback,
    block: () => T | Promise<T>,
    options?: { monotonic?: boolean },
  ): Promise<T>;
  static subscribed<T>(
    callback: NotificationCallback,
    pattern: string | RegExp | null | undefined,
    block: () => T | Promise<T>,
    options?: { monotonic?: boolean },
  ): Promise<T>;
  static async subscribed<T>(
    callback: NotificationCallback,
    patternOrBlock: string | RegExp | null | undefined | (() => T | Promise<T>),
    blockOrOptions?: (() => T | Promise<T>) | { monotonic?: boolean },
    maybeOptions?: { monotonic?: boolean },
  ): Promise<T> {
    let pattern: string | RegExp | null;
    let block: () => T | Promise<T>;
    let options: { monotonic?: boolean };
    if (typeof patternOrBlock === "function") {
      pattern = null;
      block = patternOrBlock;
      options = (blockOrOptions as { monotonic?: boolean } | undefined) ?? {};
    } else {
      pattern = patternOrBlock ?? null;
      block = blockOrOptions as () => T | Promise<T>;
      options = maybeOptions ?? {};
    }
    const sub = this._notifier.subscribe(
      pattern,
      callback as FanoutListener,
      options.monotonic ?? false,
    );
    try {
      return await block();
    } finally {
      this._notifier.unsubscribe(sub);
    }
  }

  /** Subscribe and automatically unsubscribe after the first matching event. */
  static subscribeOnce(
    pattern: string | RegExp | null | undefined,
    callback: (event: Event) => void,
  ): NotificationSubscriber {
    const sub = this._notifier.subscribe(pattern ?? null, (event: Event) => {
      this._notifier.unsubscribe(sub);
      callback(event);
    });
    return sub as unknown as NotificationSubscriber;
  }

  /** Remove a previously registered subscriber. */
  static unsubscribe(subscriber: NotificationSubscriber): void {
    this._notifier.unsubscribe(subscriber as unknown as FanoutSubscriber);
  }

  /** Remove all subscribers. Useful in tests. */
  static unsubscribeAll(): void {
    this._notifier.clear();
  }

  // -------------------------------------------------------------------------
  // Instrumentation
  // -------------------------------------------------------------------------

  /**
   * instrument(name, payload?, block?) — fire an event, optionally wrapping a block.
   *
   * Mirrors Rails' `Notifications.instrument` (notifications.rb:208-214): a thin
   * delegator that short-circuits when nothing is listening, otherwise hands off
   * to the `Instrumenter`, which owns event construction, the stack, the rescue
   * arm, and publishing (through the `Fanout`'s subscriber groups).
   */
  static instrument<T>(
    name: string,
    payload?: EventPayload,
    block?: (payload: EventPayload) => T,
  ): T extends undefined ? void : T {
    const resolved = payload ?? {};
    if (!this._notifier.listening(name)) {
      return (block ? block(resolved) : undefined) as any;
    }
    return this._boundInstrumenter.instrument(name, resolved, block) as any;
  }

  /**
   * instrumentAsync — like instrument but for async blocks.
   *
   * Rails has no async analogue; this is a trails extension that delegates the
   * same way as `instrument` (listening? short-circuit, then the Instrumenter's
   * async path) across an awaited block.
   *
   * The block receives the event payload — the same object passed in, which
   * subscribers read after the block returns. Mutating it (e.g. `row_count`)
   * is how a caller reports back into the notification, mirroring Rails'
   * `yield payload` in ActiveSupport::Notifications::Instrumenter#instrument.
   */
  static async instrumentAsync<T>(
    name: string,
    payload?: EventPayload,
    block?: (payload: EventPayload) => Promise<T>,
  ): Promise<T extends undefined ? void : T> {
    const resolved = payload ?? {};
    if (!this._notifier.listening(name)) {
      return (block ? await block(resolved) : undefined) as any;
    }
    return (await this._boundInstrumenter.instrumentAsync(name, resolved, block)) as any;
  }

  /**
   * publish — fire an event without instrumenting a block.
   * Mirrors ActiveSupport::Notifications.publish → notifier.publish, which runs
   * every matching subscriber under iterate_guarding_exceptions (re-raising).
   */
  static publish(name: string, payload?: EventPayload): void {
    const resolved = payload ?? {};
    const event = new Event(name, Temporal.Now.instant(), resolved, this._boundInstrumenter.id);
    // Deliver the passed payload object itself, not Event#initialize's dup.
    event.payload = resolved;
    event.finish();
    this._notifier.publishEvent(event);
  }

  /**
   * publishEvent — route an already-built `Event` to matching subscribers.
   * Mirrors `ActiveSupport::Notifications.publish_event` (notifications.rb:~204):
   * `notifier.publish_event(event)`.
   */
  static publishEvent(event: Event): void {
    this._notifier.publishEvent(event);
  }

  /**
   * buildHandle(name, payload) — mirrors
   * `ActiveSupport::Notifications.instrumenter.build_handle`. The returned
   * handle records the event's start at `#start` and finishes + publishes it at
   * `#finish`, so `event.duration` covers the whole span (not just the publish
   * call). Mutations made between `#start` and `#finish` (e.g.
   * `payload.outcome = ...`) are re-synced onto the event before publishing.
   */
  static buildHandle(name: string, payload: EventPayload = {}): NotificationHandle {
    return this._boundInstrumenter.buildHandle(name, payload);
  }

  /** Mirrors `ActiveSupport::Notifications.instrumenter`. */
  static get instrumenter(): NotificationInstrumenter {
    return this._boundInstrumenter;
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
}
