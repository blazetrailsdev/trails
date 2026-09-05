import { Notifications } from "./notifications.js";
import { publicInstanceMethods } from "@blazetrails/ruby-compat/include";
import type { NotificationSubscriber } from "./notifications.js";
import type { Event } from "./notifications/instrumenter.js";
import type { AnyClass } from "./descendants-tracker.js";

function snakeCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function camelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const ALREADY_PREDICATE_RE = /^(has|supports|can|should|needs|includes|responds|allows|uses)/;

function eventMethodCandidates(snakeMethod: string): string[] {
  const camel = camelCase(snakeMethod);
  if (!snakeMethod.endsWith("?")) return [camel, snakeMethod];
  const base = snakeMethod.slice(0, -1);
  const baseCamel = camelCase(base);
  const isPrefixed = "is" + baseCamel.charAt(0).toUpperCase() + baseCamel.slice(1);
  const query = baseCamel + "Q";
  const named = base.startsWith("is_")
    ? [baseCamel, query]
    : ALREADY_PREDICATE_RE.test(base)
      ? [baseCamel, isPrefixed, query]
      : [isPrefixed, baseCamel, query];
  return [...named, camel, snakeMethod];
}

interface ClassState {
  namespace?: string;
  subscriber?: Subscriber;
  notifier?: typeof Notifications;
}

const _classState = new WeakMap<AnyClass, ClassState>();

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function getClassState(cls: AnyClass): ClassState {
  return getState(cls);
}

function getState(cls: AnyClass): ClassState {
  let state = _classState.get(cls);
  if (!state) {
    state = {};
    _classState.set(cls, state);
  }
  return state;
}

export class Subscriber {
  patterns: Map<string, NotificationSubscriber> = new Map();

  private static _subscribers: Subscriber[] = [];

  static get subscribers(): Subscriber[] {
    return this._subscribers;
  }

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

  static methodAdded(event: string): void {
    const state = getState(this);
    if (!state.notifier) return;
    const snaked = event.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    this._addEventSubscriber(snaked, state);
  }

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

  call(event: Event): void {
    const dotIdx = event.name.indexOf(".");
    if (dotIdx === -1) return;
    const snakeMethod = event.name.slice(0, dotIdx);
    const method =
      eventMethodCandidates(snakeMethod).find(
        (candidate) => typeof (this as any)[candidate] === "function",
      ) ?? null;
    if (method) (this as any)[method](event);
  }

  publishEvent(event: Event): void {
    const dotIdx = event.name.indexOf(".");
    if (dotIdx === -1) return;
    const snakeMethod = event.name.slice(0, dotIdx);
    const method =
      eventMethodCandidates(snakeMethod).find(
        (candidate) => typeof (this as any)[candidate] === "function",
      ) ?? null;
    if (method) (this as any)[method](event);
  }

  private static _invalidEvent(event: string): boolean {
    return event === "start" || event === "finish";
  }

  private static _addEventSubscriber(event: string, state: ClassState): void {
    if (this._invalidEvent(event)) return;
    const subscriber = state.subscriber!;
    const notifier = state.notifier!;
    const pattern = `${event}.${state.namespace}`;

    if (subscriber.patterns.has(pattern)) return;

    subscriber.patterns.set(pattern, notifier.subscribe(pattern, subscriber));
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

  /** @missingRailsArgs public_instance_methods — PERMANENT */
  protected static _fetchPublicMethods(subscriber: Subscriber, inheritAll: boolean): string[] {
    const baseKeys = new Set(publicInstanceMethods(Subscriber, true));
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
