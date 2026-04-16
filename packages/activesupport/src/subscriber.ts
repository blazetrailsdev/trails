import { Notifications } from "./notifications.js";
import type { NotificationSubscriber } from "./notifications.js";
import type { Event } from "./notifications/instrumenter.js";

function snakeCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Per-class state storage. In Rails, `@namespace`, `@subscriber`, `@notifier`
 * are instance variables on the class (per-class), while `@@subscribers` is a
 * class variable (shared). We mirror this with a WeakMap for per-class state
 * and a shared array for subscribers.
 */
interface ClassState {
  namespace?: string;
  subscriber?: Subscriber;
  notifier?: typeof Notifications;
}

const _classState = new WeakMap<Function, ClassState>();

/** @internal Exposed for LogSubscriber to read per-class namespace. */
export function getClassState(cls: Function): ClassState {
  return getState(cls);
}

function getState(cls: Function): ClassState {
  let state = _classState.get(cls);
  if (!state) {
    state = {};
    _classState.set(cls, state);
  }
  return state;
}

/**
 * ActiveSupport::Subscriber — base class for notification consumers.
 *
 * Subclasses define instance methods matching event prefixes (e.g. `sql`
 * for `sql.active_record`). Calling `attach_to(:active_record)` wires
 * up subscriptions automatically.
 */
export class Subscriber {
  /** Per-instance map of pattern → Notifications subscriber handle. */
  patterns: Map<string, NotificationSubscriber> = new Map();

  // Shared across all subclasses, matching Rails' @@subscribers class variable.
  private static _subscribers: Subscriber[] = [];

  static get subscribers(): Subscriber[] {
    return this._subscribers;
  }

  /**
   * Attach a subscriber instance to a namespace.
   * Every public method on the subscriber (minus Subscriber's own methods)
   * becomes a listener for `<method>.<namespace>` events.
   */
  static attachTo(
    namespace: string,
    subscriber?: Subscriber,
    notifier: typeof Notifications = Notifications,
    options?: { inheritAll?: boolean },
  ): Subscriber {
    const sub = subscriber ?? new (this as any)();
    const state = getState(this);
    state.namespace = namespace;
    state.subscriber = sub;
    state.notifier = notifier;

    this._subscribers.push(sub);

    const methods = this._fetchPublicMethods(sub, options?.inheritAll ?? false);
    for (const event of methods) {
      this._addEventSubscriber(event, state);
    }

    return sub;
  }

  /**
   * Notify that a method was added to the class after attach_to.
   * In Rails this is a Ruby hook (`method_added`) that auto-subscribes
   * new public methods. Call manually in TS after dynamically adding
   * event handler methods post-attachment.
   */
  static methodAdded(event: string): void {
    const state = getState(this);
    if (!state.notifier) return;
    const snaked = event.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    this._addEventSubscriber(snaked, state);
  }

  /** Detach a subscriber from its namespace. */
  static detachFrom(namespace: string, notifier: typeof Notifications = Notifications): void {
    const state = getState(this);
    state.namespace = namespace;
    state.notifier = notifier;
    const sub = this._subscribers.find((s) => s instanceof this);
    if (!sub) return;

    state.subscriber = sub;
    const idx = this._subscribers.indexOf(sub);
    if (idx !== -1) this._subscribers.splice(idx, 1);

    const methods = this._fetchPublicMethods(sub, true);
    for (const event of methods) {
      this._removeEventSubscriber(event, state);
    }
    state.notifier = undefined;
  }

  // -- Instance methods ----------------------------------------------------

  call(event: Event): void {
    const dotIdx = event.name.indexOf(".");
    if (dotIdx === -1) return;
    const snakeMethod = event.name.slice(0, dotIdx);
    const camelMethod = camelCase(snakeMethod);
    const method =
      typeof (this as any)[camelMethod] === "function"
        ? camelMethod
        : typeof (this as any)[snakeMethod] === "function"
          ? snakeMethod
          : null;
    if (method) (this as any)[method](event);
  }

  publishEvent(event: Event): void {
    const dotIdx = event.name.indexOf(".");
    if (dotIdx === -1) return;
    const snakeMethod = event.name.slice(0, dotIdx);
    const camelMethod = camelCase(snakeMethod);
    const method =
      typeof (this as any)[camelMethod] === "function"
        ? camelMethod
        : typeof (this as any)[snakeMethod] === "function"
          ? snakeMethod
          : null;
    if (method) (this as any)[method](event);
  }

  // -- Private class helpers -----------------------------------------------

  private static _invalidEvent(event: string): boolean {
    return event === "start" || event === "finish";
  }

  private static _addEventSubscriber(event: string, state: ClassState): void {
    if (this._invalidEvent(event)) return;
    const sub = state.subscriber!;
    const notifier = state.notifier!;
    const pattern = `${event}.${state.namespace}`;

    if (sub.patterns.has(pattern)) return;

    const handle = notifier.subscribe(pattern, (e) => sub.call(e));
    sub.patterns.set(pattern, handle);
  }

  private static _removeEventSubscriber(event: string, state: ClassState): void {
    if (this._invalidEvent(event)) return;
    const sub = state.subscriber!;
    const notifier = state.notifier!;
    const pattern = `${event}.${state.namespace}`;

    const handle = sub.patterns.get(pattern);
    if (!handle) return;

    notifier.unsubscribe(handle);
    sub.patterns.delete(pattern);
  }

  protected static _fetchPublicMethods(subscriber: Subscriber, inheritAll: boolean): string[] {
    const baseKeys = new Set(Object.getOwnPropertyNames(Subscriber.prototype));
    const keys = new Set<string>();
    let proto = Object.getPrototypeOf(subscriber);

    while (proto && proto !== Subscriber.prototype && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (
          key !== "constructor" &&
          !key.startsWith("_") &&
          !baseKeys.has(key) &&
          typeof (subscriber as any)[key] === "function"
        ) {
          keys.add(key);
        }
      }
      if (!inheritAll) break;
      proto = Object.getPrototypeOf(proto);
    }

    return Array.from(keys).map((k) => snakeCase(k));
  }
}
