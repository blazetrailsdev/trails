/**
 * Connection pool queue — manages waiting for available connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Queue
 */

import type { DatabaseAdapter } from "../../../adapter.js";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue::BiasedConditionVariable
 */
export class BiasedConditionVariable {
  private _waiters: Array<(conn: DatabaseAdapter) => void> = [];

  get waitingCount(): number {
    return this._waiters.length;
  }

  wait(timeout: number): Promise<DatabaseAdapter> {
    return new Promise((resolve, reject) => {
      const state = { timer: 0 as unknown as ReturnType<typeof setTimeout> };

      const waiter = (conn: DatabaseAdapter) => {
        clearTimeout(state.timer);
        const idx = this._waiters.indexOf(waiter);
        if (idx >= 0) this._waiters.splice(idx, 1);
        resolve(conn);
      };

      state.timer = setTimeout(() => {
        const idx = this._waiters.indexOf(waiter);
        if (idx >= 0) this._waiters.splice(idx, 1);
        reject(new Error("Connection pool timeout"));
      }, timeout * 1000);

      this._waiters.push(waiter);
    });
  }

  signal(conn: DatabaseAdapter): boolean {
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter(conn);
      return true;
    }
    return false;
  }

  broadcast(connections: DatabaseAdapter[]): void {
    for (const conn of connections) {
      if (!this.signal(conn)) break;
    }
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::BiasableQueue
 */
export interface BiasableQueue {
  readonly BiasedConditionVariable: typeof BiasedConditionVariable;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Queue
 */
export class Queue {
  private _queue: DatabaseAdapter[] = [];
  private _cv = new BiasedConditionVariable();

  get length(): number {
    return this._queue.length;
  }

  get waitingCount(): number {
    return this._cv.waitingCount;
  }

  get any(): boolean {
    return this._queue.length > 0;
  }

  add(conn: DatabaseAdapter): void {
    if (!this._cv.signal(conn)) {
      this._queue.push(conn);
    }
  }

  remove(conn: DatabaseAdapter): boolean {
    const idx = this._queue.indexOf(conn);
    if (idx >= 0) {
      this._queue.splice(idx, 1);
      return true;
    }
    return false;
  }

  poll(timeout: number): Promise<DatabaseAdapter> {
    const conn = this._queue.shift();
    if (conn) return Promise.resolve(conn);
    return this._cv.wait(timeout);
  }

  clear(): DatabaseAdapter[] {
    const items = [...this._queue];
    this._queue = [];
    return items;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::ConnectionLeasingQueue
 */
export class ConnectionLeasingQueue extends Queue {
  private _leasedTo = new Map<DatabaseAdapter, string>();

  leaseTo(conn: DatabaseAdapter, key: string): void {
    this._leasedTo.set(conn, key);
  }

  unlease(conn: DatabaseAdapter): void {
    this._leasedTo.delete(conn);
  }

  leasedTo(conn: DatabaseAdapter): string | undefined {
    return this._leasedTo.get(conn);
  }
}
