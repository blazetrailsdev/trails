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
import type { Subscriber as FanoutSubscriber } from "./notifications/fanout.js";

/**
 * Opaque handle returned by `subscribe`; pass it back to `unsubscribe`. Backed
 * by the notifier's `Fanout` subscriber.
 */
export type NotificationSubscriber = FanoutSubscriber;

export type { NotificationHandle };

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
    return this._notifier.subscribe(pattern ?? null, (event: Event) => callback(event));
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
    return sub;
  }

  /** Remove a previously registered subscriber. */
  static unsubscribe(subscriber: NotificationSubscriber): void {
    this._notifier.unsubscribe(subscriber);
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
