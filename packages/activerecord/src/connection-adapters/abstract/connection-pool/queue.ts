import type { AbstractAdapter as DatabaseAdapter } from "../../abstract-adapter.js";
import { ConnectionTimeoutError } from "../../../errors.js";
import { include, type Included } from "@blazetrails/activesupport";

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Cond {
  wait(timeout: number): Promise<void>;
  signal(): void;
  broadcast(): void;
  rejectAll(error: Error): void;
}

/**
 * Ruby's `Monitor#new_cond` condition variable, which `Queue` and
 * `BiasedConditionVariable` both build on. Node has no threads to block, so a
 * waiter is a pending promise: `signal` resolves the first one, `broadcast`
 * resolves them all, and a wait that is never signalled resolves itself when
 * its timeout elapses (as `ConditionVariable#wait(timeout)` returns).
 *
 * @noRailsEquivalent Port of the Ruby stdlib primitive `@lock.new_cond`
 * returns; there is no Rails-side class to mirror.
 */
class ConditionVariable implements Cond {
  private _waiters: Waiter[] = [];

  wait(timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => this._wake(waiter), Math.max(timeout, 0) * 1000);
      this._waiters.push(waiter);
    });
  }

  signal(): void {
    const waiter = this._waiters.shift();
    if (waiter) this._wake(waiter);
  }

  broadcast(): void {
    while (this._waiters.length > 0) {
      this._wake(this._waiters.shift()!);
    }
  }

  rejectAll(error: Error): void {
    while (this._waiters.length > 0) {
      const waiter = this._waiters.shift()!;
      if (waiter.timer != null) clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private _wake(waiter: Waiter): void {
    const idx = this._waiters.indexOf(waiter);
    if (idx >= 0) this._waiters.splice(idx, 1);
    if (waiter.timer != null) {
      clearTimeout(waiter.timer);
      waiter.timer = null;
    }
    waiter.resolve();
  }
}

export class BiasedConditionVariable implements Cond {
  private _realCond = new ConditionVariable();
  private _otherCond: Cond;
  private _preferredThread: unknown;
  private _numWaitingOnRealCond = 0;

  constructor(_lock: unknown, otherCond: Cond, preferredThread: unknown) {
    this._otherCond = otherCond;
    this._preferredThread = preferredThread;
  }

  broadcast(): void {
    this.broadcastOnBiased();
    this._otherCond.broadcast();
  }

  broadcastOnBiased(): void {
    this._numWaitingOnRealCond = 0;
    this._realCond.broadcast();
  }

  signal(): void {
    let cond: Cond;
    if (this._numWaitingOnRealCond > 0) {
      this._numWaitingOnRealCond -= 1;
      cond = this._realCond;
    } else {
      cond = this._otherCond;
    }
    cond.signal();
  }

  wait(timeout: number): Promise<void> {
    let cond: Cond;
    if (this._preferredThread != null) {
      this._numWaitingOnRealCond += 1;
      cond = this._realCond;
    } else {
      cond = this._otherCond;
    }
    return cond.wait(timeout);
  }

  rejectAll(error: Error): void {
    this._realCond.rejectAll(error);
    this._otherCond.rejectAll(error);
  }
}

interface BiasableQueueHost {
  _lock?: unknown;
  _cond: Cond;
}

export function withABiasFor<T>(this: BiasableQueueHost, thread: unknown, fn: () => T): T {
  let previousCond: Cond | null = null;
  let newCond: BiasedConditionVariable | null = null;
  synchronize(this, () => {
    previousCond = this._cond;
    this._cond = newCond = new BiasedConditionVariable(this._lock, this._cond, thread);
  });
  try {
    return fn();
  } finally {
    synchronize(this, () => {
      if (previousCond) this._cond = previousCond;
      if (newCond) newCond.broadcastOnBiased();
    });
  }
}

export const BiasableQueue = {
  BiasedConditionVariable,
  withABiasFor,
};

export class Queue {
  private _queue: DatabaseAdapter[] = [];
  protected _lock?: unknown;
  protected _cond: Cond;
  private _numWaiting = 0;

  constructor(lock?: unknown) {
    this._lock = lock;
    this._cond = new ConditionVariable();
  }

  get length(): number {
    return this._queue.length;
  }

  isAnyWaiting(): boolean {
    return synchronize(this, () => {
      return this._numWaiting > 0;
    });
  }

  numWaiting(): number {
    return synchronize(this, () => {
      return this._numWaiting;
    });
  }

  /** @internal */
  get any(): boolean {
    return this._queue.length > 0;
  }

  add(element: DatabaseAdapter): void {
    synchronize(this, () => {
      this._queue.push(element);
      this._cond.signal();
    });
  }

  delete(element: DatabaseAdapter): DatabaseAdapter | undefined {
    return synchronize(this, () => {
      let deleted: DatabaseAdapter | undefined;
      for (let i = this._queue.length - 1; i >= 0; i--) {
        if (this._queue[i] === element) {
          this._queue.splice(i, 1);
          deleted = element;
        }
      }
      return deleted;
    });
  }

  poll(): DatabaseAdapter | undefined;
  poll(timeout: number): Promise<DatabaseAdapter> | DatabaseAdapter;
  poll(timeout?: number): Promise<DatabaseAdapter> | DatabaseAdapter | undefined {
    return synchronize(this, () => this.internalPoll(timeout));
  }

  clear(): void {
    synchronize(this, () => {
      this._queue = [];
    });
  }

  rejectAll(error: Error): void {
    this._cond.rejectAll(error);
  }

  protected internalPoll(timeout?: number): Promise<DatabaseAdapter> | DatabaseAdapter | undefined {
    const conn = this.noWaitPoll();
    if (conn) return conn;
    if (timeout != null) return this.waitPoll(timeout);
    return undefined;
  }

  /** @missingRailsCall size — PERMANENT */
  private canRemoveNoWait(): boolean {
    return this._queue.length > this._numWaiting;
  }

  private remove(): DatabaseAdapter | undefined {
    return this._queue.pop();
  }

  private noWaitPoll(): DatabaseAdapter | undefined {
    if (this.canRemoveNoWait()) {
      return this.remove();
    }
    return undefined;
  }

  private async waitPoll(timeout: number): Promise<DatabaseAdapter> {
    this._numWaiting += 1;

    const t0 = Date.now();
    let elapsed = 0;
    try {
      for (;;) {
        await this._cond.wait(timeout - elapsed);

        if (this.any) return this.remove()!;

        elapsed = (Date.now() - t0) / 1000;
        if (elapsed >= timeout) {
          const msg =
            `could not obtain a connection from the pool within ${timeout.toFixed(3)} seconds ` +
            `(waited ${elapsed.toFixed(3)} seconds); all pooled connections were in use`;
          throw new ConnectionTimeoutError(msg);
        }
      }
    } finally {
      this._numWaiting -= 1;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface ConnectionLeasingQueue extends Included<typeof BiasableQueue> {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ConnectionLeasingQueue extends Queue {
  private _leasedTo = new Map<DatabaseAdapter, string>();

  protected override internalPoll(
    timeout?: number,
  ): Promise<DatabaseAdapter> | DatabaseAdapter | undefined {
    const result = super.internalPoll(timeout);
    if (result && typeof (result as any).then === "function") {
      return (result as Promise<DatabaseAdapter>).then((conn) => {
        this._leaseConn(conn);
        return conn;
      });
    }
    if (result) {
      this._leaseConn(result as DatabaseAdapter);
    }
    return result;
  }

  leaseTo(conn: DatabaseAdapter, key: string): void {
    this._leasedTo.set(conn, key);
  }

  unlease(conn: DatabaseAdapter): void {
    this._leasedTo.delete(conn);
  }

  leasedTo(conn: DatabaseAdapter): string | undefined {
    return this._leasedTo.get(conn);
  }

  private _leaseConn(conn: DatabaseAdapter): void {
    if (typeof (conn as any).lease === "function") {
      (conn as any).lease();
    }
  }
}

include(ConnectionLeasingQueue, BiasableQueue);

/** @internal */
function synchronize<R>(_queue: unknown, block: () => R): R {
  return block();
}

/** @internal */
function isAny(queue: Queue): boolean {
  return queue.any;
}
