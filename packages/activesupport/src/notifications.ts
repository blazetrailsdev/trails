/**
 * ActiveSupport::Notifications — instrumentation API mirroring Rails.
 *
 * Usage:
 *   const sub = Notifications.subscribe("sql.active_record", (event) => { ... });
 *   Notifications.instrument("sql.active_record", { sql: "SELECT 1" }, () => { ... });
 *   Notifications.unsubscribe(sub);
 */

import { Event } from "./notifications/instrumenter.js";
import type { EventPayload } from "./notifications/instrumenter.js";
import { getAsyncContext } from "./async-context-adapter.js";
import type { AsyncContext } from "./async-context-adapter.js";

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

  /**
   * Event-nesting stack, scoped per async context.
   *
   * Rails tracks the instrumenter stack per-fiber via
   * `ActiveSupport::IsolatedExecutionState` — so concurrent events
   * in different fibers (or in our case, different async chains) can
   * never pop each other's entries. In Node we need the same guarantee
   * because `instrumentAsync` awaits user code between push and pop; a
   * shared process-global array corrupts under `Promise.all(...)` over
   * instrumented calls (event A pushes → B pushes → A awaits → B
   * awaits → A pops B's entry).
   *
   * Fallback stack is used when no AsyncContext scope is established
   * (e.g. top-level code before any async hop). Once we're inside an
   * async chain, `_eventStack()` returns the per-context slot.
   */
  private static _fallbackStack: Event[] = [];
  private static _stackContext: AsyncContext<Event[]> | null = null;
  private static _stackContextAdapter: ReturnType<typeof getAsyncContext> | null = null;

  private static _getStackContext(): AsyncContext<Event[]> {
    const adapter = getAsyncContext();
    if (!this._stackContext || this._stackContextAdapter !== adapter) {
      this._stackContextAdapter = adapter;
      this._stackContext = adapter.create<Event[]>();
    }
    return this._stackContext;
  }

  private static _eventStack(): Event[] {
    return this._getStackContext().getStore() ?? this._fallbackStack;
  }

  private static _runWithStack<T>(stack: Event[], fn: () => T): T {
    return this._getStackContext().run(stack, fn);
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
  static instrument<T>(
    name: string,
    payload?: EventPayload,
    block?: () => T,
  ): T extends undefined ? void : T {
    const event = new Event(name, new Date(), payload ?? {});

    // Track nesting for child events
    const current = this._eventStack();
    const parent = current[current.length - 1];
    if (parent) {
      parent.children.push(event);
    }

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
      result = this._runWithStack(inner, block);
    } finally {
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

    const current = this._eventStack();
    const parent = current[current.length - 1];
    if (parent) {
      parent.children.push(event);
    }

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
      result = await this._runWithStack(inner, block);
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
