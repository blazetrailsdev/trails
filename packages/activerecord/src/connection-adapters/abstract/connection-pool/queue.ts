/**
 * Connection pool queue — manages waiting for available connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Queue
 *
 * Rails uses Monitor-based synchronization with condition variables.
 * In single-threaded Node we model the same fairness semantics using
 * Promise-based waiters: `signal` resolves a pending waiter's promise
 * directly with the connection, while `poll` either takes from the
 * internal array (if fairness allows) or creates a new waiter promise.
 */

import type { DatabaseAdapter } from "../../../adapter.js";
import { ConnectionTimeoutError } from "../../../errors.js";
import { include, type Included } from "@blazetrails/activesupport";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable
 *
 * In Rails this wraps two condition variables (one biased, one fallback) and
 * preferentially wakes the biased thread. In Node (single-threaded) the bias
 * is structurally a no-op, but we implement the full API so that callers
 * (ConnectionLeasingQueue, withABiasFor) work identically.
 */
interface WaiterState {
  container: Array<(conn: DatabaseAdapter) => void>;
  timer: ReturnType<typeof setTimeout> | null;
  settled: boolean;
}

export class BiasedConditionVariable {
  private _waiters: Array<(conn: DatabaseAdapter) => void> = [];
  private _otherCond: BiasedConditionVariable | null;

  constructor(
    _lock?: unknown,
    otherCond?: BiasedConditionVariable | null,
    _preferredThread?: unknown,
  ) {
    this._otherCond = otherCond ?? null;
  }

  get waitingCount(): number {
    return this._waiters.length;
  }

  wait(timeout: number): Promise<DatabaseAdapter> {
    return new Promise((resolve, reject) => {
      const state: WaiterState = {
        container: this._waiters,
        timer: null,
        settled: false,
      };

      const waiter = (conn: DatabaseAdapter) => {
        if (state.settled) return;
        state.settled = true;
        if (state.timer != null) {
          clearTimeout(state.timer);
          state.timer = null;
        }
        const idx = state.container.indexOf(waiter);
        if (idx >= 0) state.container.splice(idx, 1);
        resolve(conn);
      };
      (waiter as any)._state = state;

      state.timer = setTimeout(() => {
        if (state.settled) return;
        state.settled = true;
        const idx = state.container.indexOf(waiter);
        if (idx >= 0) state.container.splice(idx, 1);
        const msg =
          `could not obtain a connection from the pool within ${timeout.toFixed(3)} seconds; ` +
          `all pooled connections were in use`;
        reject(new ConnectionTimeoutError(msg));
      }, timeout * 1000);

      this._waiters.push(waiter);
    });
  }

  /**
   * In Rails, signal prefers the biased thread's cond, then falls back to
   * the other cond. In Node (single-threaded) all waiters land on this CV's
   * _waiters, so we try local first, then delegate to _otherCond.
   */
  signal(conn: DatabaseAdapter): boolean {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(conn);
      return true;
    }
    if (this._otherCond) {
      return this._otherCond.signal(conn);
    }
    return false;
  }

  broadcast(connections: DatabaseAdapter[]): void {
    const remaining = this.broadcastOnBiased(connections);
    if (this._otherCond && remaining.length > 0) {
      this._otherCond.broadcast(remaining);
    }
  }

  broadcastOnBiased(connections: DatabaseAdapter[]): DatabaseAdapter[] {
    let i = 0;
    while (i < connections.length && this._waiters.length > 0) {
      const waiter = this._waiters.shift()!;
      waiter(connections[i]);
      i++;
    }
    return connections.slice(i);
  }

  /**
   * Transfer all pending waiters to another condition variable.
   * Used by withABiasFor cleanup to migrate orphaned waiters back to
   * the restored cond so they can be signaled by future add() calls.
   * Updates each waiter's container ref so timeout cleanup targets
   * the correct array.
   */
  transferWaitersTo(target: BiasedConditionVariable): void {
    while (this._waiters.length > 0) {
      const waiter = this._waiters.shift()!;
      const waiterState = (waiter as any)._state as WaiterState | undefined;
      if (waiterState) {
        waiterState.container = target._waiters;
      }
      target._waiters.push(waiter);
    }
  }
}

/**
 * Host interface for BiasableQueue mixin — the including class must
 * expose a mutable `_cond` field.
 */
interface BiasableQueueHost {
  _cond: BiasedConditionVariable;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue
 *
 * In Rails this is a module included into ConnectionLeasingQueue that adds
 * `with_a_bias_for(thread)` to temporarily bias the queue's condition variable
 * toward a specific thread.
 */
export const BiasableQueue = {
  BiasedConditionVariable,

  withABiasFor<T>(this: BiasableQueueHost, context: unknown, fn: () => T): T {
    const previousCond = this._cond;
    const newCond = new BiasedConditionVariable(undefined, this._cond, context);
    this._cond = newCond;
    try {
      return fn();
    } finally {
      this._cond = previousCond;
      newCond.transferWaitersTo(previousCond);
    }
  },
};

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Queue
 *
 * Threadsafe, fair, LIFO queue. In Rails, fairness is enforced by tracking
 * `@num_waiting` — a no-timeout poll only succeeds when queue size exceeds
 * the number of threads blocked in wait_poll. We mirror this with _numWaiting.
 */
export class Queue {
  private _queue: DatabaseAdapter[] = [];
  protected _cond: BiasedConditionVariable;
  private _numWaiting = 0;

  constructor(lock?: unknown) {
    this._cond = new BiasedConditionVariable(lock);
  }

  get length(): number {
    return this._queue.length;
  }

  get waitingCount(): number {
    return this._cond.waitingCount;
  }

  isAnyWaiting(): boolean {
    return this._numWaiting > 0;
  }

  numWaiting(): number {
    return this._numWaiting;
  }

  get any(): boolean {
    return this._queue.length > 0;
  }

  add(element: DatabaseAdapter): void {
    if (!this._cond.signal(element)) {
      this._queue.push(element);
    }
  }

  delete(element: DatabaseAdapter): DatabaseAdapter | undefined {
    const idx = this._queue.indexOf(element);
    if (idx >= 0) {
      this._queue.splice(idx, 1);
      return element;
    }
    return undefined;
  }

  remove(conn: DatabaseAdapter): boolean {
    const idx = this._queue.indexOf(conn);
    if (idx >= 0) {
      this._queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  poll(): DatabaseAdapter | undefined;
  poll(timeout: number): Promise<DatabaseAdapter> | DatabaseAdapter;
  poll(timeout?: number): Promise<DatabaseAdapter> | DatabaseAdapter | undefined {
    return this.internalPoll(timeout);
  }

  clear(): DatabaseAdapter[] {
    const items = [...this._queue];
    this._queue = [];
    return items;
  }

  protected internalPoll(timeout?: number): Promise<DatabaseAdapter> | DatabaseAdapter | undefined {
    const conn = this.noWaitPoll();
    if (conn) return conn;
    if (timeout != null) return this.waitPoll(timeout);
    return undefined;
  }

  private canRemoveNoWait(): boolean {
    return this._queue.length > this._numWaiting;
  }

  private noWaitPoll(): DatabaseAdapter | undefined {
    if (this.canRemoveNoWait()) {
      return this._queue.pop();
    }
    return undefined;
  }

  private waitPoll(timeout: number): Promise<DatabaseAdapter> {
    this._numWaiting++;
    return this._cond.wait(timeout).finally(() => {
      this._numWaiting--;
    });
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue
 *
 * Connections returned by poll are automatically leased while still inside
 * the queue's critical section, matching Rails where internal_poll calls
 * conn.lease before returning.
 */
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

// Rails: `include BiasableQueue` in ConnectionLeasingQueue
include(ConnectionLeasingQueue, BiasableQueue);
