import { Notifications } from "./notifications.js";
import { rbFSend, rbModMethodDefined, TypeError } from "@blazetrails/ruby-compat";
import { publicInstanceMethods } from "@blazetrails/ruby-compat/include";
import type { NotificationSubscriber } from "./notifications.js";
import type { Event } from "./notifications/instrumenter.js";

/** @noRailsEquivalent PERMANENT */
function snakeCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** @noRailsEquivalent PERMANENT */
function camelCase(str: string): string {
  if (str.endsWith("?")) {
    const base = camelCase(str.slice(0, -1));
    return "is" + base.charAt(0).toUpperCase() + base.slice(1);
  }
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export class Subscriber {
  patterns: Map<string, NotificationSubscriber>;

  private static _subscribers: Subscriber[] = [];
  declare private static _namespace?: string;
  declare private static _subscriber?: Subscriber;
  declare private static _notifier?: typeof Notifications;
  declare private static _inheritAll?: boolean;

  static attachTo(
    namespace: string,
    subscriber: Subscriber = new this(),
    notifier: typeof Notifications = Notifications,
    { inheritAll = false }: { inheritAll?: boolean } = {},
  ): string[] {
    this._namespace = namespace;
    this._subscriber = subscriber;
    this._notifier = notifier;
    this._inheritAll = inheritAll;

    this.subscribers.push(subscriber);

    const events = this.fetchPublicMethods(subscriber, inheritAll);
    for (const event of events) {
      this.addEventSubscriber(event);
    }
    return events;
  }

  static detachFrom(namespace: string, notifier: typeof Notifications = Notifications): void {
    this._namespace = namespace;
    this._subscriber = this.findAttachedSubscriber();
    this._notifier = notifier;

    const subscriber = this.subscriber;
    if (!subscriber) return;

    const idx = this.subscribers.indexOf(subscriber);
    if (idx !== -1) this.subscribers.splice(idx, 1);

    for (const event of this.fetchPublicMethods(subscriber, true)) {
      this.removeEventSubscriber(event);
    }

    this._notifier = undefined;
  }

  static methodAdded(event: string): void {
    if (rbModMethodDefined(this, event) && this.notifier) {
      event = snakeCase(event);
      this.addEventSubscriber(event);
    }
  }

  static get subscribers(): Subscriber[] {
    return Subscriber._subscribers;
  }

  /** @internal */
  protected static get subscriber(): Subscriber | undefined {
    return Object.hasOwn(this, "_subscriber") ? this._subscriber : undefined;
  }

  /** @internal */
  protected static get notifier(): typeof Notifications | undefined {
    return Object.hasOwn(this, "_notifier") ? this._notifier : undefined;
  }

  /** @internal */
  protected static get namespace(): string | undefined {
    return Object.hasOwn(this, "_namespace") ? this._namespace : undefined;
  }

  private static addEventSubscriber(event: string): void {
    if (this.isInvalidEvent(event)) return;

    const pattern = this.preparePattern(event);

    if (this.isPatternSubscribed(pattern)) return;

    this.subscriber!.patterns.set(pattern, this.notifier!.subscribe(pattern, this.subscriber!));
  }

  private static removeEventSubscriber(event: string): void {
    if (this.isInvalidEvent(event)) return;

    const pattern = this.preparePattern(event);

    if (!this.isPatternSubscribed(pattern)) return;

    this.notifier!.unsubscribe(this.subscriber!.patterns.get(pattern)!);
    this.subscriber!.patterns.delete(pattern);
  }

  /** @internal */
  private static findAttachedSubscriber(): Subscriber | undefined {
    return this.subscribers.find((attachedSubscriber) => attachedSubscriber.constructor === this);
  }

  private static isInvalidEvent(event: string): boolean {
    return event === "start" || event === "finish";
  }

  /** @internal */
  private static preparePattern(event: string): string {
    return `${event}.${this.namespace}`;
  }

  /** @internal */
  private static isPatternSubscribed(pattern: string): boolean {
    return this.subscriber!.patterns.has(pattern);
  }

  /** @missingRailsArgs public_instance_methods — PERMANENT */
  protected static fetchPublicMethods(subscriber: Subscriber, inheritAll: boolean): string[] {
    const baseKeys = new Set(publicInstanceMethods(Subscriber, true));
    const keys = new Set<string>();
    let proto = Object.getPrototypeOf(subscriber);

    while (proto && proto !== Subscriber.prototype && proto !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(proto)) {
        if (
          key !== "constructor" &&
          !key.startsWith("_") &&
          !baseKeys.has(key) &&
          typeof Reflect.get(subscriber, key) === "function"
        ) {
          keys.add(key);
        }
      }
      if (!inheritAll) break;
      proto = Object.getPrototypeOf(proto);
    }

    return Array.from(keys).map((k) => snakeCase(k));
  }

  constructor() {
    this.patterns = new Map();
  }

  call(event: Event): unknown {
    const method = event.name.slice(0, _index(event.name, "."));
    return rbFSend(this, camelCase(method), event);
  }

  publishEvent(event: Event): unknown {
    const method = event.name.slice(0, _index(event.name, "."));
    return rbFSend(this, camelCase(method), event);
  }
}

/** @noRailsEquivalent PERMANENT */
function _index(str: string, substring: string): number {
  const index = str.indexOf(substring);
  if (index === -1) throw new TypeError("no implicit conversion from nil to integer");
  return index;
}
