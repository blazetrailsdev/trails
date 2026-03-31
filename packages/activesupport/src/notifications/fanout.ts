import { Event } from "./instrumenter.js";

export class InstrumentationSubscriberError extends Error {
  readonly exceptions: Error[];

  constructor(exceptions: Error[]) {
    const names = exceptions.map((e) => e.constructor.name);
    super(`Exception(s) occurred within instrumentation subscribers: ${names.join(", ")}`, {
      cause: exceptions[0],
    });
    this.name = "InstrumentationSubscriberError";
    this.exceptions = exceptions;
  }
}

function iterateGuardingExceptions<T>(collection: T[], fn: (item: T) => void): void {
  let exceptions: Error[] | null = null;

  for (const item of collection) {
    try {
      fn(item);
    } catch (e) {
      exceptions ??= [];
      exceptions.push(e instanceof Error ? e : new Error(String(e)));
    }
  }

  if (exceptions) {
    const flat = exceptions.flatMap((e) =>
      e instanceof InstrumentationSubscriberError ? e.exceptions : [e],
    );
    if (flat.length === 1) {
      throw flat[0];
    }
    throw new InstrumentationSubscriberError(flat);
  }
}

type EventedListener = {
  start(name: string, id: unknown, payload: Record<string, unknown>): void;
  finish(name: string, id: unknown, payload: Record<string, unknown>): void;
};

type TimedCallback = (
  name: string,
  start: Date | number,
  finish: Date | number,
  id: unknown,
  payload: Record<string, unknown>,
) => void;

type EventObjectCallback = (event: Event) => void;

export interface Matcher {
  matches(name: string): boolean;
  unsubscribe(name: string): void;
}

class StringMatcher implements Matcher {
  constructor(readonly pattern: string) {}
  matches(name: string): boolean {
    return this.pattern === name;
  }
  unsubscribe(_name: string): void {}
}

class RegExpMatcher implements Matcher {
  private exclusions = new Set<string>();
  constructor(readonly pattern: RegExp) {}
  matches(name: string): boolean {
    this.pattern.lastIndex = 0;
    return this.pattern.test(name) && !this.exclusions.has(name);
  }
  unsubscribe(name: string): void {
    this.pattern.lastIndex = 0;
    if (this.pattern.test(name)) {
      this.exclusions.add(name);
    }
  }
}

export class AllMessages implements Matcher {
  matches(_name: string): boolean {
    return true;
  }
  unsubscribe(_name: string): void {}
}

const AllMatcher = AllMessages;

function wrapMatcher(pattern: string | RegExp | null): Matcher {
  if (typeof pattern === "string") return new StringMatcher(pattern);
  if (pattern instanceof RegExp) return new RegExpMatcher(pattern);
  return new AllMatcher();
}

type SubscriberKind = "evented" | "timed" | "monotonic" | "event_object";

interface Subscriber {
  readonly matcher: Matcher;
  readonly kind: SubscriberKind;
  readonly delegate: EventedListener | TimedCallback | EventObjectCallback;
  subscribed(name: string): boolean;
}

function createSubscriber(
  pattern: string | RegExp | null,
  listener: EventedListener | TimedCallback | EventObjectCallback,
  monotonic: boolean,
): Subscriber {
  const matcher = wrapMatcher(pattern);
  let kind: SubscriberKind;

  if (
    typeof listener === "object" &&
    listener !== null &&
    "start" in listener &&
    "finish" in listener
  ) {
    kind = "evented";
  } else {
    kind = monotonic ? "monotonic" : "timed";
    if (typeof listener === "function" && listener.length === 1) {
      kind = "event_object";
    }
  }

  return {
    matcher,
    kind,
    delegate: listener,
    subscribed(name: string) {
      return matcher.matches(name);
    },
  };
}

export abstract class BaseGroup {
  abstract start(name: string, id: unknown, payload: Record<string, unknown>): void;
  abstract finish(name: string, id: unknown, payload: Record<string, unknown>): void;
}

export abstract class BaseTimeGroup extends BaseGroup {}

type Group = BaseGroup;

export class EventedGroup extends BaseGroup {
  constructor(private listeners: EventedListener[]) {
    super();
  }

  start(name: string, id: unknown, payload: Record<string, unknown>): void {
    iterateGuardingExceptions(this.listeners, (l) => l.start(name, id, payload));
  }

  finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    iterateGuardingExceptions(this.listeners, (l) => l.finish(name, id, payload));
  }
}

export class TimedGroup extends BaseTimeGroup {
  private startTime: Date | null = null;
  constructor(private listeners: TimedCallback[]) {
    super();
  }

  start(_name: string, _id: unknown, _payload: Record<string, unknown>): void {
    this.startTime = new Date();
  }

  finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    const stopTime = new Date();
    iterateGuardingExceptions(this.listeners, (l) =>
      l(name, this.startTime!, stopTime, id, payload),
    );
  }
}

export class MonotonicTimedGroup extends BaseTimeGroup {
  private startTime = 0;
  constructor(private listeners: TimedCallback[]) {
    super();
  }

  start(_name: string, _id: unknown, _payload: Record<string, unknown>): void {
    this.startTime = performance.now();
  }

  finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    const stopTime = performance.now();
    iterateGuardingExceptions(this.listeners, (l) =>
      l(name, this.startTime, stopTime, id, payload),
    );
  }
}

export class EventObjectGroup extends BaseGroup {
  private event: Event | null = null;
  constructor(private listeners: EventObjectCallback[]) {
    super();
  }

  start(name: string, id: unknown, payload: Record<string, unknown>): void {
    this.event = new Event(name, new Date(), payload, String(id));
  }

  finish(_name: string, _id: unknown, payload: Record<string, unknown>): void {
    if (this.event) {
      Object.assign(this.event.payload, payload);
      this.event.finish();
      iterateGuardingExceptions(this.listeners, (l) => l(this.event!));
    }
  }
}

export class Handle {
  protected state: "initialized" | "started" | "finished" = "initialized";
  protected groups: Group[];
  protected _name: string;
  protected _id: unknown;
  protected _payload: Record<string, unknown>;

  constructor(groups: Group[], name: string, id: unknown, payload: Record<string, unknown>) {
    this.groups = groups;
    this._name = name;
    this._id = id;
    this._payload = payload;
  }

  start(): void {
    if (this.state !== "initialized") {
      throw new Error(`expected state to be "initialized" but was "${this.state}"`);
    }
    this.state = "started";
    iterateGuardingExceptions(this.groups, (g) => g.start(this._name, this._id, this._payload));
  }

  finish(): void {
    this.finishWithValues(this._name, this._id, this._payload);
  }

  finishWithValues(name: string, id: unknown, payload: Record<string, unknown>): void {
    if (this.state !== "started") {
      throw new Error(`expected state to be "started" but was "${this.state}"`);
    }
    this.state = "finished";
    iterateGuardingExceptions(this.groups, (g) => g.finish(name, id, payload));
  }
}

class FanoutHandle extends Handle {}

export class Fanout {
  private stringSubscribers = new Map<string, Subscriber[]>();
  private otherSubscribers: Subscriber[] = [];
  private listenersCache = new Map<string, Subscriber[]>();
  private handleStack: FanoutHandle[] = [];

  subscribe(
    pattern: string | RegExp | null,
    listener: EventedListener | TimedCallback | EventObjectCallback,
    monotonic = false,
  ): Subscriber {
    const sub = createSubscriber(pattern, listener, monotonic);

    if (typeof pattern === "string") {
      let list = this.stringSubscribers.get(pattern);
      if (!list) {
        list = [];
        this.stringSubscribers.set(pattern, list);
      }
      list.push(sub);
      this.clearCache(pattern);
    } else {
      this.otherSubscribers.push(sub);
      this.clearCache();
    }

    return sub;
  }

  unsubscribe(subscriberOrName: Subscriber | string): void {
    if (typeof subscriberOrName === "string") {
      const list = this.stringSubscribers.get(subscriberOrName);
      if (list) list.length = 0;
      this.clearCache(subscriberOrName);
      for (const sub of this.otherSubscribers) {
        sub.matcher.unsubscribe(subscriberOrName);
      }
    } else {
      const pattern = subscriberOrName.matcher;
      if (pattern instanceof StringMatcher) {
        const list = this.stringSubscribers.get(pattern.pattern);
        if (list) {
          const idx = list.indexOf(subscriberOrName);
          if (idx !== -1) list.splice(idx, 1);
        }
        this.clearCache(pattern.pattern);
      } else {
        const idx = this.otherSubscribers.indexOf(subscriberOrName);
        if (idx !== -1) this.otherSubscribers.splice(idx, 1);
        this.clearCache();
      }
    }
  }

  start(name: string, id: unknown, payload: Record<string, unknown>): void {
    const handle = this.buildHandle(name, id, payload);
    this.handleStack.push(handle);
    handle.start();
  }

  finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    const handle = this.handleStack.pop();
    if (handle) {
      handle.finishWithValues(name, id, payload);
    }
  }

  buildHandle(name: string, id: unknown, payload: Record<string, unknown>): Handle {
    const groups = this.groupsFor(name);
    return new FanoutHandle(groups, name, id, payload);
  }

  private allListenersFor(name: string): Subscriber[] {
    let cached = this.listenersCache.get(name);
    if (cached) return cached;

    const stringList = this.stringSubscribers.get(name) ?? [];
    const matching = this.otherSubscribers.filter((s) => s.subscribed(name));
    cached = [...stringList, ...matching];
    this.listenersCache.set(name, cached);
    return cached;
  }

  listening(name: string): boolean {
    return this.allListenersFor(name).length > 0;
  }

  private groupsFor(name: string): Group[] {
    const listeners = this.allListenersFor(name);
    const byKind = new Map<SubscriberKind, Subscriber[]>();

    for (const sub of listeners) {
      let list = byKind.get(sub.kind);
      if (!list) {
        list = [];
        byKind.set(sub.kind, list);
      }
      list.push(sub);
    }

    const groups: Group[] = [];
    const evented = byKind.get("evented");
    if (evented) {
      groups.push(new EventedGroup(evented.map((s) => s.delegate as EventedListener)));
    }
    const timed = byKind.get("timed");
    if (timed) {
      groups.push(new TimedGroup(timed.map((s) => s.delegate as TimedCallback)));
    }
    const monotonic = byKind.get("monotonic");
    if (monotonic) {
      groups.push(new MonotonicTimedGroup(monotonic.map((s) => s.delegate as TimedCallback)));
    }
    const eventObj = byKind.get("event_object");
    if (eventObj) {
      groups.push(new EventObjectGroup(eventObj.map((s) => s.delegate as EventObjectCallback)));
    }

    return groups;
  }

  private clearCache(key?: string): void {
    if (key) {
      this.listenersCache.delete(key);
    } else {
      this.listenersCache.clear();
    }
  }
}

export class Evented<D = EventedListener> {
  readonly pattern: Matcher;
  readonly delegate: D;

  constructor(pattern: string | RegExp | null, delegate: D) {
    this.pattern = wrapMatcher(pattern);
    this.delegate = delegate;
  }
}

export class Timed extends Evented<TimedCallback> {}
export class MonotonicTimed extends Timed {}
export class EventObject extends Evented<EventObjectCallback> {}

export const Subscribers = { Evented, Timed, MonotonicTimed, EventObject };
