/**
 * ActiveSupport::Notifications — instrumentation API mirroring Rails.
 *
 * Usage:
 *   const sub = Notifications.subscribe("sql.active_record", (event) => { ... });
 *   Notifications.instrument("sql.active_record", { sql: "SELECT 1" }, () => { ... });
 *   Notifications.unsubscribe(sub);
 */

import { Temporal } from "./temporal.js";
import { Event } from "./notifications/instrumenter.js";
import type { EventPayload } from "./notifications/instrumenter.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

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
  return e.constructor?.name ?? typeof e;
}

export type NotificationSubscriber = {
  readonly pattern: string | RegExp | null;
  readonly callback: (event: Event) => void;
};

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

  private static readonly _STACK_KEY = Symbol.for("as_notification_instrumenter");

  private static _eventStack(): Event[] {
    return IsolatedExecutionState.fetch<Event[]>(this._STACK_KEY, () => []);
  }

  private static _runWithStack<T>(stack: Event[], fn: () => T): T {
    return IsolatedExecutionState.scope(this._STACK_KEY, stack, fn);
  }

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
    const sub: Subscriber = {
      pattern: pattern ?? null,
      callback: (event: Event) => {
        this._subscribers.delete(sub);
        callback(event);
      },
    };
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
  private static _buildEvent(name: string, payload?: EventPayload, current?: Event[]): Event {
    const event = new Event(name, Temporal.Now.instant(), payload ?? {});
    const stack = current ?? this._eventStack();
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(event);
    }
    return event;
  }

  static instrument<T>(
    name: string,
    payload?: EventPayload,
    block?: (payload: EventPayload) => T,
  ): T extends undefined ? void : T {
    const resolved = payload ?? {};

    if (!this._listening(name)) {
      return (block ? block(resolved) : undefined) as any;
    }

    const current = this._eventStack();
    const event = this._buildEvent(name, resolved, current);

    if (!block) {
      event.finish();
      this._notify(event);
      return undefined as any;
    }

    // Run `block` inside a forked stack with `event` pushed. Because
    // the fork is AsyncContext-scoped, sibling concurrent instruments
    // can't see or pop `event` from here — and we never need an
    // explicit pop, the scope just ends.
    const inner = [...current, event];
    let result: T;
    try {
      result = this._runWithStack(inner, () => block(event.payload));
    } catch (e) {
      this._recordException(event.payload, e);
      throw e;
    } finally {
      event.finish();
      this._notify(event);
    }
    return result as any;
  }

  /**
   * instrumentAsync — like instrument but for async blocks.
   *
   * Rails has no async analogue; this is a trails extension that mirrors
   * `instrument` (listening? short-circuit, rescue arm, event stack) across an
   * awaited block.
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

    if (!this._listening(name)) {
      return (block ? await block(resolved) : undefined) as any;
    }

    const current = this._eventStack();
    const event = this._buildEvent(name, resolved, current);

    if (!block) {
      event.finish();
      this._notify(event);
      return undefined as any;
    }

    // Fork the stack per-call via AsyncContext so concurrent
    // instrumentAsync calls can't corrupt each other's nesting under
    // `Promise.all(...)` or other out-of-order resolution. Each
    // awaited continuation resumes inside its own fork.
    const inner = [...current, event];
    let result: T;
    try {
      result = await this._runWithStack(inner, () => block(event.payload));
    } catch (e) {
      this._recordException(event.payload, e);
      throw e;
    } finally {
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
    const event = this._buildEvent(name, payload);
    event.finish();
    this._notify(event, true);
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

  /**
   * Mirrors Fanout#listening? — true when any subscriber matches `name`.
   * Rails' Notifications.instrument short-circuits on this, so an unlistened
   * event pays for neither event construction nor publish.
   */
  private static _listening(name: string): boolean {
    for (const sub of this._subscribers) {
      if (this._matches(sub.pattern, name)) return true;
    }
    return false;
  }

  /**
   * Mirrors the `rescue Exception` arm of Instrumenter#instrument: `exception`
   * is the [class name, message] pair, `exception_object` the error itself.
   */
  private static _recordException(payload: EventPayload, e: unknown): void {
    payload.exception = [_classNameOf(e), e instanceof Error ? e.message : String(e)];
    payload.exception_object = e;
  }

  private static _notify(event: Event, propagate = false): void {
    for (const sub of this._subscribers) {
      if (this._matches(sub.pattern, event.name)) {
        if (propagate) {
          sub.callback(event);
        } else {
          try {
            sub.callback(event);
          } catch {
            // Swallow subscriber errors — matches Rails instrument() behavior
          }
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
