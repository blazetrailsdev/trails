/**
 * ActiveSupport::Notifications — instrumentation API mirroring Rails.
 *
 * Usage:
 *   const sub = Notifications.subscribe("sql.active_record", (event) => { ... });
 *   Notifications.instrument("sql.active_record", { sql: "SELECT 1" }, () => { ... });
 *   Notifications.unsubscribe(sub);
 */

import { Temporal } from "@blazetrails/date";
import { Event, Instrumenter } from "./notifications/instrumenter.js";
import type { EventPayload, NotificationHandle } from "./notifications/instrumenter.js";
import { Fanout } from "./notifications/fanout.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import type { CallableListener } from "./notifications/fanout.js";

// The concrete subscriber handle the notifier hands back. Kept internal (not the
// public `NotificationSubscriber`) so the `Fanout` subscriber's members don't
// leak into this module's exported API surface.
type FanoutSubscriber = ReturnType<Fanout["subscribe"]>;

const ACTIVE_SUPPORT_NOTIFICATIONS_REGISTRY = Symbol("active_support_notifications_registry");

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
 * be the five-arity form to see monotonic (`number`) start/finish times. Rails
 * also accepts any object responding to `call` (`Fanout::Subscribers.new`,
 * notifications/fanout.rb:328), so a callable object is a subscriber too.
 */
export type NotificationCallback =
  | CallableListener
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
 * ActiveSupport::Notifications — global instrumentation hub.
 *
 * Unlike Rails, this is a static singleton class rather than a module. It owns
 * a `Fanout` notifier and a single `Instrumenter` bound to it, mirroring Rails'
 * `Notifications.notifier` / `Notifications.instrumenter`.
 */
export class Notifications {
  private static _notifier: Fanout = new Fanout();

  /** Mirrors `attr_accessor :notifier` in `class << self` (notifications.rb:198). */
  static get notifier(): Fanout {
    return this._notifier;
  }

  static set notifier(notifier: Fanout) {
    this._notifier = notifier;
  }

  /**
   * Mirrors the private `registry` (notifications.rb:274-276): the
   * instrumenter-per-notifier map lives in the isolated execution state, so
   * each task gets its own instrumenter rather than sharing one id.
   */
  private static get registry(): Map<Fanout, Instrumenter> {
    return IsolatedExecutionState.fetch<Map<Fanout, Instrumenter>>(
      ACTIVE_SUPPORT_NOTIFICATIONS_REGISTRY,
      () => new Map(),
    );
  }

  // -------------------------------------------------------------------------
  // Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to events matching `pattern`.
   * - string: exact name match
   * - RegExp: regex match against name
   * - null/omitted: all events
   *
   * A function callback is wrapped so it presents to the `Fanout` as an
   * event-object (single-arity) subscriber, which always receives the built
   * `Event` — trails' public API always yields the Event, regardless of the
   * callback's arity. A callable object is forwarded to the notifier untouched,
   * as `notifications.rb:244-245` forwards `callback`, so `Subscribers.new`
   * classifies it by its own `call` (fanout.rb:328-331).
   */
  static subscribe(
    pattern: string | RegExp | null | undefined,
    callback: ((event: Event) => void) | CallableListener,
  ): NotificationSubscriber {
    const sub =
      typeof callback === "function"
        ? this.notifier.subscribe(pattern ?? null, (event: Event) => callback(event))
        : this.notifier.subscribe(pattern ?? null, callback);
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
  static monotonicSubscribe(callback: NotificationCallback): NotificationSubscriber;
  static monotonicSubscribe(
    pattern: string | RegExp | null | undefined,
    callback: NotificationCallback,
  ): NotificationSubscriber;
  static monotonicSubscribe(
    patternOrCallback: string | RegExp | null | undefined | NotificationCallback,
    maybeCallback?: NotificationCallback,
  ): NotificationSubscriber {
    let pattern: string | RegExp | null;
    let callback: NotificationCallback;
    if (
      typeof patternOrCallback === "string" ||
      patternOrCallback instanceof RegExp ||
      patternOrCallback == null
    ) {
      pattern = patternOrCallback ?? null;
      callback = maybeCallback!;
    } else {
      pattern = null;
      callback = patternOrCallback;
    }
    const sub = this.notifier.subscribe(pattern, callback as FanoutListener, true);
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
    ...args: [
      callback: NotificationCallback,
      block: () => T | Promise<T>,
      options?: { monotonic?: boolean },
    ]
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
    const subscriber = this.notifier.subscribe(
      pattern,
      callback as FanoutListener,
      options.monotonic ?? false,
    );
    try {
      return await block();
    } finally {
      this.notifier.unsubscribe(subscriber);
    }
  }

  /** Subscribe and automatically unsubscribe after the first matching event. */
  static subscribeOnce(
    pattern: string | RegExp | null | undefined,
    callback: (event: Event) => void,
  ): NotificationSubscriber {
    const sub = this.notifier.subscribe(pattern ?? null, (event: Event) => {
      this.notifier.unsubscribe(sub);
      callback(event);
    });
    return sub as unknown as NotificationSubscriber;
  }

  /** Remove a previously registered subscriber. */
  static unsubscribe(subscriberOrName: NotificationSubscriber | string): void {
    this.notifier.unsubscribe(subscriberOrName as unknown as FanoutSubscriber);
  }

  /** Remove all subscribers. Useful in tests. */
  static unsubscribeAll(): void {
    this.notifier.clear();
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
    payload: EventPayload = {},
    block?: (payload: EventPayload) => T,
  ): T extends undefined ? void : T {
    if (!this.notifier.listening(name)) {
      return (block ? block(payload) : undefined) as any;
    }
    return this.instrumenter.instrument(name, payload, block) as any;
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
    if (!this.notifier.listening(name)) {
      return (block ? await block(resolved) : undefined) as any;
    }
    return (await this.instrumenter.instrumentAsync(name, resolved, block)) as any;
  }

  /**
   * publish — fire an event without instrumenting a block.
   * Mirrors ActiveSupport::Notifications.publish → notifier.publish, which runs
   * every matching subscriber under iterate_guarding_exceptions (re-raising).
   */
  static publish(name: string, ...args: [EventPayload?]): void {
    const resolved = args[0] ?? {};
    const event = this.instrumenter.newEvent(name, resolved);
    event.startBang();
    // Deliver the passed payload object itself, not Event#initialize's dup.
    event.payload = resolved;
    event.finishBang();
    this.notifier.publishEvent(event);
  }

  /**
   * publishEvent — route an already-built `Event` to matching subscribers.
   * Mirrors `ActiveSupport::Notifications.publish_event` (notifications.rb:~204):
   * `notifier.publish_event(event)`.
   */
  static publishEvent(event: Event): void {
    this.notifier.publishEvent(event);
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
    return this.instrumenter.buildHandle(name, payload);
  }

  /** Mirrors `ActiveSupport::Notifications.instrumenter` (notifications.rb:270-272). */
  static get instrumenter(): Instrumenter {
    const registry = this.registry;
    let instrumenter = registry.get(this.notifier);
    if (!instrumenter) {
      instrumenter = new Instrumenter(this.notifier);
      registry.set(this.notifier, instrumenter);
    }
    return instrumenter;
  }
}
