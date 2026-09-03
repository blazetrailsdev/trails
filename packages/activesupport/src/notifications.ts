import { Temporal } from "@blazetrails/date";
import { Event, Instrumenter } from "./notifications/instrumenter.js";
import type { EventPayload, NotificationHandle } from "./notifications/instrumenter.js";
import { Fanout } from "./notifications/fanout.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";
import type { CallableListener } from "./notifications/fanout.js";

type FanoutSubscriber = ReturnType<Fanout["subscribe"]>;

const ACTIVE_SUPPORT_NOTIFICATIONS_REGISTRY = Symbol("active_support_notifications_registry");

declare const notificationSubscriberBrand: unique symbol;
export type NotificationSubscriber = { readonly [notificationSubscriberBrand]: true };

export type { NotificationHandle };

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

type FanoutListener = Parameters<Fanout["subscribe"]>[1];

export class Notifications {
  private static _notifier: Fanout = new Fanout();

  static get notifier(): Fanout {
    return this._notifier;
  }

  static set notifier(notifier: Fanout) {
    this._notifier = notifier;
  }

  private static get registry(): Map<Fanout, Instrumenter> {
    return IsolatedExecutionState.fetch<Map<Fanout, Instrumenter>>(
      ACTIVE_SUPPORT_NOTIFICATIONS_REGISTRY,
      () => new Map(),
    );
  }

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

  static unsubscribe(subscriberOrName: NotificationSubscriber | string): void {
    this.notifier.unsubscribe(subscriberOrName as unknown as FanoutSubscriber);
  }

  static unsubscribeAll(): void {
    this.notifier.clear();
  }

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

  static async instrumentAsync<T>(
    name: string,
    payload?: EventPayload,
    block?: (payload: EventPayload) => Promise<T>,
  ): Promise<T extends undefined ? void : T> {
    const resolved = payload ?? {};
    if (!this.notifier.listening(name)) {
      return (block ? await block(resolved) : undefined) as any;
    }
    return (await this.instrumenter.instrument(name, resolved, block)) as any;
  }

  static publish(name: string, ...args: [EventPayload?]): void {
    const resolved = args[0] ?? {};
    const event = this.instrumenter.newEvent(name, resolved);
    event.startBang();
    event.payload = resolved;
    event.finishBang();
    this.notifier.publishEvent(event);
  }

  static publishEvent(event: Event): void {
    this.notifier.publishEvent(event);
  }

  static buildHandle(name: string, payload: EventPayload = {}): NotificationHandle {
    return this.instrumenter.buildHandle(name, payload);
  }

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
