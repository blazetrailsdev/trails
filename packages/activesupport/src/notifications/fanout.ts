import { Temporal } from "@blazetrails/date";
import { Event } from "./instrumenter.js";
import { IsolatedExecutionState } from "../isolated-execution-state.js";

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

/** @internal */
export function iterateGuardingExceptions<T>(collection: T[], fn: (item: T) => void): T[] {
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

  // Rails' iterate_guarding_exceptions returns the collection (fanout.rb:41).
  return collection;
}

// Rails' Fanout::Handle#ensure_state! raises ArgumentError (fanout.rb:263-267).
class ArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArgumentError";
  }
}

type EventedListener = {
  start(name: string, id: unknown, payload: Record<string, unknown>): void;
  finish(name: string, id: unknown, payload: Record<string, unknown>): void;
};

type TimedCallback = (
  name: string,
  start: Temporal.Instant | number | null,
  finish: Temporal.Instant | number | null,
  id: unknown,
  payload: Record<string, unknown>,
) => void;

type EventObjectCallback = (event: Event) => void;

type Delegate = EventedListener | TimedCallback | EventObjectCallback;

/**
 * Any object responding to `call` — Rails' `Subscribers.new` reaches for
 * `listener.method(:call)` whenever the listener is not itself procish
 * (fanout.rb:328), so a plain object with a `call` method subscribes. Ruby then
 * invokes `@delegate.call` uniformly for procs and callable objects
 * (fanout.rb:423, 439); JS has no such uniform invocation, so `Subscribers.new`
 * binds the object's `call` to its receiver and the groups keep calling a
 * function.
 *
 * Rails classifies a listener as EventObject on `procish.arity == 1 &&
 * procish.parameters.length == 1` (fanout.rb:330). JS exposes only
 * `Function.length`, which counts the parameters before the first defaulted or
 * rest one and has no `parameters` analogue — so `(event, ...rest)`, which Ruby
 * keeps timed, reads as single-arity here. There is no runtime reflection that
 * closes that gap short of parsing `Function.prototype.toString`.
 */
export type CallableListener = { call(...args: never[]): void };

/**
 * Mirrors `Fanout::Subscribers::Matcher` (fanout.rb:338-372).
 *
 * Rails' `wrap` returns the String pattern itself and relies on `String#===`;
 * TS has no such polymorphic `===`, so a String pattern is wrapped in
 * `StringMatcher` — the same three-way dispatch, spelled through one method.
 */
export class Matcher {
  readonly pattern: RegExp;
  readonly exclusions = new Set<string>();

  static wrap(pattern: string | RegExp | null): AnyMatcher {
    if (typeof pattern === "string") {
      return new StringMatcher(pattern);
    } else if (pattern == null) {
      return new AllMessages();
    } else {
      return new Matcher(pattern);
    }
  }

  constructor(pattern: RegExp) {
    this.pattern = pattern;
  }

  unsubscribeBang(name: string): void {
    this.pattern.lastIndex = 0;
    if (this.pattern.test(name)) this.exclusions.add(name);
  }

  /** Ruby `Matcher#===` (fanout.rb:360-362). */
  matches(name: string): boolean {
    this.pattern.lastIndex = 0;
    return this.pattern.test(name) && !this.exclusions.has(name);
  }
}

// Ruby's `Matcher.wrap` hands a String pattern back untouched (fanout.rb:341-349)
// and matches it with `String#===`. TS has no polymorphic `===`, so that arm
// gets an object with the same two methods as the other two matcher kinds.
// `unsubscribe!` is never reached for a String pattern — Fanout#unsubscribe
// only walks @other_subscribers (fanout.rb:88) — and answers false as
// AllMessages#unsubscribe! does (fanout.rb:369-371).
class StringMatcher {
  constructor(readonly pattern: string) {}

  unsubscribeBang(_name: string): boolean {
    return false;
  }

  matches(name: string): boolean {
    return this.pattern === name;
  }
}

export class AllMessages {
  unsubscribeBang(_name: string): boolean {
    return false;
  }

  matches(_name: string): boolean {
    return true;
  }
}

type AnyMatcher = Matcher | StringMatcher | AllMessages;

/** The constructor a subscriber's `group_class` names (fanout.rb:386, 418, 428, 434). */
type GroupClass = new (
  listeners: never[],
  name: string,
  id: unknown,
  payload: Record<string, unknown>,
) => BaseGroup;

export abstract class BaseGroup<L = Delegate> {
  protected listeners: L[];

  constructor(listeners: L[], _name: string, _id: unknown, _payload: Record<string, unknown>) {
    this.listeners = listeners;
  }

  each(block: (listener: L) => void): void {
    iterateGuardingExceptions(this.listeners, block);
  }

  abstract start(name: string, id: unknown, payload: Record<string, unknown>): void;

  abstract finish(name: string, id: unknown, payload: Record<string, unknown>): void;
}

export class BaseTimeGroup extends BaseGroup<TimedCallback> {
  private startTime: Temporal.Instant | number = 0;

  override start(_name: string, _id: unknown, _payload: Record<string, unknown>): void {
    this.startTime = this.now();
  }

  override finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    const stopTime = this.now();
    this.each((listener) => {
      listener(name, this.startTime, stopTime, id, payload);
    });
  }

  protected now(): Temporal.Instant | number {
    return Temporal.Now.instant();
  }
}

export class MonotonicTimedGroup extends BaseTimeGroup {
  protected override now(): number {
    return performance.now();
  }
}

export class TimedGroup extends BaseTimeGroup {
  protected override now(): Temporal.Instant {
    return Temporal.Now.instant();
  }
}

export class EventedGroup extends BaseGroup<EventedListener> {
  override start(name: string, id: unknown, payload: Record<string, unknown>): void {
    this.each((s) => {
      s.start(name, id, payload);
    });
  }

  override finish(name: string, id: unknown, payload: Record<string, unknown>): void {
    this.each((s) => {
      s.finish(name, id, payload);
    });
  }
}

export class EventObjectGroup extends BaseGroup<EventObjectCallback> {
  private _event: Event | null = null;

  /** The Event built at #start — trails threads child-event nesting through it. */
  get event(): Event | null {
    return this._event;
  }

  override start(name: string, id: unknown, payload: Record<string, unknown>): void {
    this._event = this.buildEvent(name, id, payload);
    this._event.startBang();
  }

  override finish(_name: string, _id: unknown, payload: Record<string, unknown>): void {
    // Rails' EventObjectGroup#finish: `@event.payload = payload` — replace the
    // dup with the final object so deletions are reflected (fanout.rb:166-178).
    this._event!.payload = payload;
    this._event!.finishBang();

    this.each((s) => {
      s(this._event!);
    });
  }

  private buildEvent(name: string, id: unknown, payload: Record<string, unknown>): Event {
    return new Event(name, null, null, String(id), payload);
  }
}

export class Handle {
  private _name: string;
  private _id: unknown;
  private _payload: Record<string, unknown>;
  private groups: BaseGroup[];
  private state: ":initialized" | ":started" | ":finished" = ":initialized";

  constructor(notifier: Fanout, name: string, id: unknown, payload: Record<string, unknown>) {
    this._name = name;
    this._id = id;
    this._payload = payload;
    this.groups = [...notifier.groupsFor(name)].map(
      ([groupKlass, groupedListeners]) =>
        new groupKlass(groupedListeners as never[], name, id, payload),
    );
  }

  /**
   * The Event this handle's event-object group built at #start (if any), so a
   * caller can thread trails' child-event nesting across nested handles.
   */
  get event(): Event | null {
    for (const g of this.groups) {
      if (g instanceof EventObjectGroup) return g.event;
    }
    return null;
  }

  start(): void {
    this.ensureStateBang(":initialized");
    this.state = ":started";

    iterateGuardingExceptions(this.groups, (group) => {
      group.start(this._name, this._id, this._payload);
    });
  }

  finish(): void {
    this.finishWithValues(this._name, this._id, this._payload);
  }

  finishWithValues(name: string, id: unknown, payload: Record<string, unknown>): void {
    this.ensureStateBang(":started");
    this.state = ":finished";

    iterateGuardingExceptions(this.groups, (group) => {
      group.finish(name, id, payload);
    });
  }

  private ensureStateBang(expected: string): void {
    if (this.state !== expected) {
      throw new ArgumentError(`expected state to be ${expected} but was ${this.state}`);
    }
  }
}

/**
 * This is a default queue implementation that ships with Notifications.
 * It just pushes events to all registered log subscribers.
 */
export class Fanout {
  private stringSubscribers = new Map<string, Evented[]>();
  private otherSubscribers: Evented[] = [];
  private allListenersForCache = new Map<string, Evented[]>();
  private groupsForCache = new Map<string, Map<GroupClass, Delegate[]>>();
  private silenceableGroupsForCache = new Map<string, Map<GroupClass, Delegate[]>>();

  // Rails keeps the evented start/finish handle stack in
  // `IsolatedExecutionState[:_fanout_handle_stack]` (fanout.rb:277), so
  // concurrent tasks don't share one stack. The key is per-Fanout so separate
  // notifiers can't collide.
  private readonly _handleStackKey = Symbol("as_fanout_handle_stack");

  private handleStack(): Handle[] {
    return IsolatedExecutionState.fetch<Handle[]>(this._handleStackKey, () => []);
  }

  subscribe(
    pattern: string | RegExp | null,
    listener: EventedListener | TimedCallback | EventObjectCallback | CallableListener,
    monotonic = false,
  ): Evented {
    const subscriber = Subscribers.new(pattern, listener, monotonic);

    if (typeof pattern === "string") {
      let list = this.stringSubscribers.get(pattern);
      if (!list) {
        list = [];
        this.stringSubscribers.set(pattern, list);
      }
      list.push(subscriber);
      this.clearCache(pattern);
    } else {
      this.otherSubscribers.push(subscriber);
      this.clearCache();
    }

    return subscriber;
  }

  unsubscribe(subscriberOrName: Evented | string): void {
    if (typeof subscriberOrName === "string") {
      const list = this.stringSubscribers.get(subscriberOrName);
      if (list) list.length = 0;
      this.clearCache(subscriberOrName);
      for (const sub of this.otherSubscribers) {
        sub.unsubscribeBang(subscriberOrName);
      }
    } else {
      const pattern = subscriberOrName.pattern;
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

  clearCache(key?: string): void {
    if (key) {
      this.allListenersForCache.delete(key);
      this.groupsForCache.delete(key);
      this.silenceableGroupsForCache.delete(key);
    } else {
      this.allListenersForCache.clear();
      this.groupsForCache.clear();
      this.silenceableGroupsForCache.clear();
    }
  }

  /**
   * @missingRailsCall transform_values — PERMANENT: Ruby Hash#transform_values:
   *   `group_by(&:group_class).transform_values { |s| s.map(&:delegate) }`
   *   (notifications/fanout.rb:189-191) is folded into the local groupBy helper,
   *   which emits the delegate lists directly.
   */
  groupsFor(name: string): Map<GroupClass, Delegate[]> {
    let groups = this.groupsForCache.get(name);
    if (!groups) {
      groups = groupBy(this.allListenersFor(name).filter((s) => !s.silenceable));
      this.groupsForCache.set(name, groups);
    }

    let silenceableGroups = this.silenceableGroupsForCache.get(name);
    if (!silenceableGroups) {
      silenceableGroups = groupBy(this.allListenersFor(name).filter((s) => s.silenceable));
      this.silenceableGroupsForCache.set(name, silenceableGroups);
    }

    if (silenceableGroups.size > 0) {
      groups = new Map(groups);
      for (const [groupClass, subscriptions] of silenceableGroups) {
        const activeSubscriptions = subscriptions.filter((s) => {
          const silenced = (s as unknown as { silenced(name: string): unknown }).silenced(name);
          return silenced == null || silenced === false;
        });
        if (activeSubscriptions.length > 0) {
          groups.set(groupClass, [...(groups.get(groupClass) ?? []), ...activeSubscriptions]);
        }
      }
    }

    return groups;
  }

  buildHandle(name: string, id: unknown, payload: Record<string, unknown>): Handle {
    return new Handle(this, name, id, payload);
  }

  start(name: string, id: unknown, payload: Record<string, unknown>): void {
    const handleStack = this.handleStack();
    const handle = this.buildHandle(name, id, payload);
    handleStack.push(handle);
    handle.start();
  }

  finish(
    name: string,
    id: unknown,
    payload: Record<string, unknown>,
    _listeners: unknown = null,
  ): void {
    const handleStack = this.handleStack();
    const handle = handleStack.pop();
    // Rails pops nil off an empty stack and lets finish_with_values raise
    // NoMethodError (fanout.rb:283-287); the assertion keeps an unbalanced
    // finish loud rather than silently doing nothing.
    handle!.finishWithValues(name, id, payload);
  }

  publish(name: string, ...args: unknown[]): void {
    iterateGuardingExceptions(this.listenersFor(name), (s) => {
      s.publish(name, ...args);
    });
  }

  publishEvent(event: Event): void {
    iterateGuardingExceptions(this.listenersFor(event.name), (s) => {
      s.publishEvent(event);
    });
  }

  allListenersFor(name: string): Evented[] {
    let listeners = this.allListenersForCache.get(name);
    if (!listeners) {
      listeners = [
        ...(this.stringSubscribers.get(name) ?? []),
        ...this.otherSubscribers.filter((s) => s.isSubscribedTo(name)),
      ];
      this.allListenersForCache.set(name, listeners);
    }
    return listeners;
  }

  listenersFor(name: string): Evented[] {
    return this.allListenersFor(name).filter((s) => !s.isSilenced(name));
  }

  /** Mirrors: `listening?` (fanout.rb:310-312). */
  listening(name: string): boolean {
    return this.allListenersFor(name).some((s) => !s.isSilenced(name));
  }

  // This is a sync queue, so there is no waiting.
  wait(): void {}

  /**
   * Drop every subscriber and reset cached state. Used by unsubscribeAll.
   *
   * @noRailsEquivalent PERMANENT — Rails' test suite resets a notifier by
   * reassigning `Notifications.notifier`, relying on Ruby's ivar reflection
   * for the rest; JS has no such reflection, so the reset is a method.
   */
  clear(): void {
    this.stringSubscribers.clear();
    this.otherSubscribers.length = 0;
    this.clearCache();
  }
}

// Ruby's `group_by(&:group_class).transform_values { |s| s.map(&:delegate) }`
// (fanout.rb:189-197) in one pass — JS has no Enumerable#group_by.
function groupBy(subscribers: Evented[]): Map<GroupClass, Delegate[]> {
  const groups = new Map<GroupClass, Delegate[]>();
  for (const s of subscribers) {
    const groupClass = s.groupClass();
    let list = groups.get(groupClass);
    if (!list) {
      list = [];
      groups.set(groupClass, list);
    }
    list.push(s.delegate);
  }
  return groups;
}

export class Evented<D = Delegate> {
  readonly pattern: AnyMatcher;
  readonly delegate: D;
  readonly silenceable: boolean;
  private canPublish: boolean;
  private canPublishEvent: boolean;

  constructor(pattern: string | RegExp | null, delegate: D) {
    this.pattern = Matcher.wrap(pattern);
    this.delegate = delegate;
    this.silenceable = typeof (delegate as { silenced?: unknown })?.silenced === "function";
    this.canPublish = typeof (delegate as { publish?: unknown })?.publish === "function";
    this.canPublishEvent =
      typeof (delegate as { publishEvent?: unknown })?.publishEvent === "function";
  }

  groupClass(): GroupClass {
    return EventedGroup as GroupClass;
  }

  publish(name: string, ...args: unknown[]): void {
    if (this.canPublish) {
      (this.delegate as { publish(name: string, ...args: unknown[]): void }).publish(name, ...args);
    }
  }

  publishEvent(event: Event): void {
    if (this.canPublishEvent) {
      (this.delegate as { publishEvent(event: Event): void }).publishEvent(event);
    } else {
      this.publish(event.name, event.time, event.end, event.transactionId, event.payload);
    }
  }

  isSilenced(name: string): boolean {
    if (!this.silenceable) return false;
    const silenced = (this.delegate as { silenced(name: string): unknown }).silenced(name);
    return silenced != null && silenced !== false;
  }

  isSubscribedTo(name: string): boolean {
    return this.pattern.matches(name);
  }

  unsubscribeBang(name: string): void {
    this.pattern.unsubscribeBang(name);
  }
}

export class Timed extends Evented<TimedCallback> {
  override groupClass(): GroupClass {
    return TimedGroup as GroupClass;
  }

  override publish(name: string, ...args: unknown[]): void {
    (this.delegate as (...args: unknown[]) => void)(name, ...args);
  }
}

export class MonotonicTimed extends Timed {
  override groupClass(): GroupClass {
    return MonotonicTimedGroup as GroupClass;
  }
}

export class EventObject extends Evented<EventObjectCallback> {
  override groupClass(): GroupClass {
    return EventObjectGroup as GroupClass;
  }

  override publishEvent(event: Event): void {
    this.delegate(event);
  }
}

export class Subscribers {
  static new(
    pattern: string | RegExp | null,
    listener: EventedListener | TimedCallback | EventObjectCallback | CallableListener,
    monotonic: boolean,
  ): Evented {
    if (
      typeof listener === "object" &&
      listener !== null &&
      "start" in listener &&
      "finish" in listener
    ) {
      return new Evented(pattern, listener);
    }

    // Doing this to detect a single argument block or callable
    // like `proc { |x| }` vs `proc { |*x| }` (fanout.rb:325-331).
    const procish = (
      typeof listener === "function" ? listener : (listener.call as (...args: never[]) => void)
    ) as (...args: never[]) => void;
    const delegate = typeof listener === "function" ? procish : procish.bind(listener);

    if (procish.length === 1) {
      return new EventObject(pattern, delegate as EventObjectCallback);
    }
    return monotonic
      ? new MonotonicTimed(pattern, delegate as TimedCallback)
      : new Timed(pattern, delegate as TimedCallback);
  }

  static readonly Matcher = Matcher;
  static readonly Evented = Evented;
  static readonly Timed = Timed;
  static readonly MonotonicTimed = MonotonicTimed;
  static readonly EventObject = EventObject;
}
