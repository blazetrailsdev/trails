import { ArgumentError, Process, SecureRandom } from "@blazetrails/ruby-compat";

export type EventPayload = Record<string, unknown>;

export class Event {
  readonly name: string;
  readonly transactionId: string;
  payload: EventPayload;
  private _time: number | null;
  private _end: number | null;
  private _cpuTimeStart = 0.0;
  private _cpuTimeFinish = 0.0;
  private _gcTimeStart = 0;
  private _gcTimeFinish = 0;

  constructor(
    name: string,
    start: number | null,
    ending: number | null,
    transactionId: string,
    payload: EventPayload,
  ) {
    this.name = name;
    this.payload = { ...payload };
    this._time = start != null ? start * 1_000.0 : start;
    this.transactionId = transactionId;
    this._end = ending != null ? ending * 1_000.0 : ending;
  }

  get time(): number | null {
    return this._time != null ? this._time / 1000.0 : null;
  }

  get end(): number | null {
    return this._end != null ? this._end / 1000.0 : null;
  }

  record<T = void>(fn?: (payload: EventPayload) => T): T {
    this.startBang();
    let result: T;
    try {
      result = fn ? fn(this.payload) : (undefined as unknown as T);
    } catch (e) {
      _recordException(this.payload, e);
      this.finishBang();
      throw e;
    }
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          this.finishBang();
          return value;
        },
        (e) => {
          _recordException(this.payload, e);
          this.finishBang();
          throw e;
        },
      ) as T;
    }
    this.finishBang();
    return result;
  }

  startBang(): void {
    this._time = this.now();
    this._cpuTimeStart = this.nowCpu();
    this._gcTimeStart = this.nowGc();
  }

  finishBang(): void {
    this._cpuTimeFinish = this.nowCpu();
    this._gcTimeFinish = this.nowGc();
    this._end = this.now();
  }

  get cpuTime(): number {
    return this._cpuTimeFinish - this._cpuTimeStart;
  }

  get idleTime(): number {
    const diff = this.duration - this.cpuTime;
    return diff > 0.0 ? diff : 0.0;
  }

  get gcTime(): number {
    return (this._gcTimeFinish - this._gcTimeStart) / 1_000_000.0;
  }

  get duration(): number {
    return this._end! - this._time!;
  }

  private now(): number {
    return Process.clockGettime(Process.CLOCK_MONOTONIC, ":float_millisecond");
  }

  private nowCpu(): number {
    return 0.0;
  }

  private nowGc(): number {
    return 0;
  }
}

function _classNameOf(e: unknown): string {
  if (e instanceof Error) {
    if (e.name && e.name !== "Error") return e.name;
    const ctor = e.constructor?.name;
    if (ctor && ctor !== "Error") return ctor;
    return e.name || ctor || "Error";
  }
  return (e as { constructor?: { name?: string } })?.constructor?.name ?? "Error";
}

function _recordException(payload: EventPayload, e: unknown): void {
  payload.exception = [_classNameOf(e), e instanceof Error ? e.message : String(e)];
  payload.exception_object = e;
}

export interface InstrumenterNotifier {
  publish?(name: string, event: Event): void;
  buildHandle?(name: string, id: unknown, payload: EventPayload): NotificationHandle;
  start?(name: string, id: unknown, payload: EventPayload): void;
  finish?(name: string, id: unknown, payload: EventPayload, listenersState?: unknown): void;
}

export interface NotificationHandle {
  start(): void;
  finish(): void;
}

export class Instrumenter {
  private _notifier: InstrumenterNotifier;
  readonly id: string;

  constructor(notifier: InstrumenterNotifier) {
    this._notifier = notifier;
    this.id = this.uniqueId();
  }

  instrument<T = void>(
    name: string,
    payload: EventPayload = {},
    fn?: (payload: EventPayload) => T,
  ): T {
    const handle = this.buildHandle(name, payload);
    handle.start();

    let result: T;
    try {
      result = fn ? fn(payload) : (undefined as unknown as T);
    } catch (e) {
      _recordException(payload, e);
      handle.finish();
      throw e;
    }
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          handle.finish();
          return value;
        },
        (e) => {
          _recordException(payload, e);
          handle.finish();
          throw e;
        },
      ) as T;
    }
    handle.finish();
    return result;
  }

  buildHandle(name: string, payload: EventPayload = {}): NotificationHandle {
    if (this._notifier.buildHandle) {
      return this._notifier.buildHandle(name, this.id, payload);
    }
    return new Handle(
      name,
      payload,
      this.id,
      this._notifier as InstrumenterNotifier & {
        publish(name: string, event: Event): void;
      },
    );
  }

  newEvent(name: string, payload: EventPayload = {}): Event {
    return new Event(name, null, null, this.id, payload);
  }

  start(name: string, payload: EventPayload): void {
    this._notifier.start?.(name, this.id, payload);
  }

  finish(name: string, payload: EventPayload): void {
    this._notifier.finish?.(name, this.id, payload);
  }

  finishWithState(listenersState: unknown, name: string, payload: EventPayload): void {
    this._notifier.finish?.(name, this.id, payload, listenersState);
  }

  private uniqueId(): string {
    return SecureRandom.hex(10);
  }
}

export class Handle implements NotificationHandle {
  private _state: "initialized" | "started" | "finished" = "initialized";
  private _event: Event | null = null;

  constructor(
    private _name: string,
    private _payload: EventPayload,
    private _transactionId: string,
    private _notifier: { publish(name: string, event: Event): void },
  ) {}

  start(): void {
    if (this._state !== "initialized") {
      throw new ArgumentError(`expected state to be "initialized" but was "${this._state}"`);
    }
    this._state = "started";
    this._event = new Event(this._name, null, null, this._transactionId, this._payload);
    this._event.startBang();
  }

  finish(): void {
    if (this._state !== "started") {
      throw new ArgumentError(`expected state to be "started" but was "${this._state}"`);
    }
    this._state = "finished";
    if (this._event) {
      this._event.payload = this._payload;
      this._event.finishBang();
      this._notifier.publish(this._event.name, this._event);
    }
  }
}

export class LegacyHandle {
  private _event: Event;
  private _notifier: { publish(name: string, event: Event): void };

  constructor(event: Event, notifier: { publish(name: string, event: Event): void }) {
    this._event = event;
    this._notifier = notifier;
  }

  finish(): void {
    this._event.finishBang();
    this._notifier.publish(this._event.name, this._event);
  }
}

export class Wrapper {
  private _instrumenter: Instrumenter;

  constructor(notifier: { publish(name: string, event: Event): void }) {
    this._instrumenter = new Instrumenter(notifier);
  }

  get instrumenter(): Instrumenter {
    return this._instrumenter;
  }
}
