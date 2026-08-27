export interface ReapablePool {
  reap?(): void;
  flush?(): Promise<void>;
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
    if (!this.frequency || this.frequency <= 0) return;
    Reaper.registerPool(this.pool, this.frequency);
  }

  private static _pools = new Map<number, WeakRef<ReapablePool>[]>();
  private static _timers = new Map<number, ReturnType<typeof setInterval>>();

  /** @missingRailsCall spawn_thread — PERMANENT */
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
          void p.flush?.()?.catch(() => {});
        }
      }
    }, frequency * 1000);

    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
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

/** @internal */
function spawnThread(frequency: number): ReturnType<typeof setInterval> | null {
  if (!frequency || frequency <= 0 || !Number.isFinite(frequency)) return null;
  const internals = Reaper as unknown as {
    _timers: Map<number, ReturnType<typeof setInterval>>;
    _spawnTimer: (f: number) => ReturnType<typeof setInterval>;
  };
  const existing = internals._timers.get(frequency);
  if (existing) return existing;
  const timer = internals._spawnTimer(frequency);
  internals._timers.set(frequency, timer);
  return timer;
}
