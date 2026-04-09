/**
 * Connection pool reaper — periodically reaps and flushes idle connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Reaper
 *
 * Every `frequency` seconds, the reaper calls `reap()` and `flush()` on each
 * registered pool. A reaper instantiated with a zero or null frequency will
 * never reap the connection pool.
 *
 * Rails uses a class-level registry (`@pools`, `@threads`) so that one reaper
 * timer is shared across all pools with the same frequency. We mirror this with
 * static maps and `setInterval`, using WeakRef to avoid preventing pool GC.
 */

export interface ReapablePool {
  reap?(): void;
  flush?(): void;
  isDiscarded?(): boolean;
}

export class Reaper {
  private _pool: ReapablePool;
  private _frequency: number;

  constructor(pool: ReapablePool, frequency: number) {
    this._pool = pool;
    this._frequency = frequency;
  }

  get pool(): ReapablePool {
    return this._pool;
  }

  get frequency(): number {
    return this._frequency;
  }

  run(): void {
    if (!this._frequency || this._frequency <= 0) return;
    Reaper.registerPool(this._pool, this._frequency);
  }

  // --- Class-level registry (mirrors Rails @mutex/@pools/@threads) ---

  private static _pools = new Map<number, WeakRef<ReapablePool>[]>();
  private static _timers = new Map<number, ReturnType<typeof setInterval>>();

  static registerPool(pool: ReapablePool, frequency: number): void {
    if (!frequency || frequency <= 0 || !Number.isFinite(frequency)) return;
    if (pool.isDiscarded?.()) return;

    if (!Reaper._timers.has(frequency)) {
      Reaper._timers.set(frequency, Reaper._spawnTimer(frequency));
    }

    const refs = Reaper._pools.get(frequency) ?? [];
    const alive = refs.filter((ref) => {
      const p = ref.deref();
      return p != null && !p.isDiscarded?.();
    });

    if (alive.some((ref) => ref.deref() === pool)) {
      Reaper._pools.set(frequency, alive);
      return;
    }

    alive.push(new WeakRef(pool));
    Reaper._pools.set(frequency, alive);
  }

  private static _spawnTimer(frequency: number): ReturnType<typeof setInterval> {
    const timer = setInterval(() => {
      const refs = Reaper._pools.get(frequency);
      if (!refs) {
        Reaper._stopTimer(frequency);
        return;
      }

      const alive = refs.filter((ref) => {
        const p = ref.deref();
        return p != null && !p.isDiscarded?.();
      });

      if (alive.length === 0) {
        Reaper._pools.delete(frequency);
        Reaper._stopTimer(frequency);
        return;
      }

      Reaper._pools.set(frequency, alive);

      for (const ref of alive) {
        const p = ref.deref();
        if (p) {
          p.reap?.();
          p.flush?.();
        }
      }
    }, frequency * 1000);

    if (typeof timer === "object" && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }

    return timer;
  }

  private static _stopTimer(frequency: number): void {
    const timer = Reaper._timers.get(frequency);
    if (timer) {
      clearInterval(timer);
      Reaper._timers.delete(frequency);
    }
  }
}
