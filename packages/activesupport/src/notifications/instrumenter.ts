import { Process, rbObjRespondTo, SecureRandom } from "@blazetrails/ruby-compat";

export type EventPayload = Record<string, unknown>;

export class Event {
  readonly name: string;
  readonly transactionId: string;
  payload: EventPayload;
  private _time: number | null;
  private _end: number | null;
  private _cpuTimeStart = 0.0;
  private _cpuTimeFinish = 0.0;
  private _allocationCountStart = 0;
  private _allocationCountFinish = 0;
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
    this._allocationCountStart = this.nowAllocations();
  }

  finishBang(): void {
    this._cpuTimeFinish = this.nowCpu();
    this._gcTimeFinish = this.nowGc();
    this._end = this.now();
    this._allocationCountFinish = this.nowAllocations();
  }

  get cpuTime(): number {
    return this._cpuTimeFinish - this._cpuTimeStart;
  }

  get idleTime(): number {
    const diff = this.duration - this.cpuTime;
    return diff > 0.0 ? diff : 0.0;
  }

  get allocations(): number {
    return this._allocationCountFinish - this._allocationCountStart;
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
    return Process.clockGettime(Process.CLOCK_THREAD_CPUTIME_ID, ":float_millisecond");
  }

  private nowGc(): number {
    return 0;
  }

  private nowAllocations(): number {
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
  buildHandle?(name: string, id: unknown, payload: EventPayload): NotificationHandle;
  start?(name: string, id: unknown, payload: EventPayload): unknown;
  finish?(name: string, id: unknown, payload: EventPayload, listenersState?: unknown): unknown;
}

export interface NotificationHandle {
  start(): void;
  finish(): void;
}

export class Instrumenter {
  readonly id: string;
  private _notifier: InstrumenterNotifier & {
    buildHandle(name: string, id: unknown, payload: EventPayload): NotificationHandle;
  };

  constructor(notifier: InstrumenterNotifier) {
    if (!rbObjRespondTo(notifier, "buildHandle")) {
      notifier = new Wrapper(notifier);
    }

    this.id = this.uniqueId();
    this._notifier = notifier as Instrumenter["_notifier"];
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
    return this._notifier.buildHandle(name, this.id, payload);
  }

  newEvent(name: string, payload: EventPayload = {}): Event {
    return new Event(name, null, null, this.id, payload);
  }

  start(name: string, payload: EventPayload): void {
    this._notifier.start!(name, this.id, payload);
  }

  finish(name: string, payload: EventPayload): void {
    this._notifier.finish!(name, this.id, payload);
  }

  finishWithState(listenersState: unknown, name: string, payload: EventPayload): void {
    this._notifier.finish!(name, this.id, payload, listenersState);
  }

  private uniqueId(): string {
    return SecureRandom.hex(10);
  }
}

export class LegacyHandle implements NotificationHandle {
  private _notifier: InstrumenterNotifier;
  private _name: string;
  private _id: unknown;
  private _payload: EventPayload;
  private _listenerState: unknown;

  constructor(notifier: InstrumenterNotifier, name: string, id: unknown, payload: EventPayload) {
    this._notifier = notifier;
    this._name = name;
    this._id = id;
    this._payload = payload;
  }

  start(): void {
    this._listenerState = this._notifier.start!(this._name, this._id, this._payload);
  }

  finish(): void {
    this._notifier.finish!(this._name, this._id, this._payload, this._listenerState);
  }
}

export class Wrapper {
  private _notifier: InstrumenterNotifier;

  constructor(notifier: InstrumenterNotifier) {
    this._notifier = notifier;
  }

  buildHandle(name: string, id: unknown, payload: EventPayload): LegacyHandle {
    return new LegacyHandle(this._notifier, name, id, payload);
  }

  start(...args: [name: string, id: unknown, payload: EventPayload]): unknown {
    return this._notifier.start!(...args);
  }

  finish(
    ...args: [name: string, id: unknown, payload: EventPayload, listenersState?: unknown]
  ): unknown {
    return this._notifier.finish!(...args);
  }
}
