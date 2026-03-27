/**
 * Connection pool reaper — removes stale connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper
 */

export class Reaper {
  private _interval: number;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _pool: { removeStaleConnections?(): void };

  constructor(pool: { removeStaleConnections?(): void }, interval: number) {
    this._pool = pool;
    this._interval = interval;
  }

  get interval(): number {
    return this._interval;
  }

  start(): void {
    if (this._interval <= 0 || this._timer) return;
    this._timer = setInterval(() => {
      this._pool.removeStaleConnections?.();
    }, this._interval * 1000);
    if (this._timer) {
      (this._timer as any).unref?.();
    }
  }

  stop(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}
