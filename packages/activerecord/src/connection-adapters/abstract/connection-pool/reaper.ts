import { selectBang } from "@blazetrails/activesupport";
import { Mutex, Thread, isEmpty } from "@blazetrails/ruby-compat";

export interface ReapablePool {
  reap(): Promise<void>;
  flush(): Promise<void>;
  isDiscarded(): boolean;
}

export class Reaper {
  private _pool: ReapablePool;
  private _frequency: number;

  get pool(): ReapablePool {
    return this._pool;
  }

  get frequency(): number {
    return this._frequency;
  }

  constructor(pool: ReapablePool, frequency: number) {
    this._pool = pool;
    this._frequency = frequency;
  }

  private static mutex = new Mutex();
  private static pools = new Map<number, WeakRef<ReapablePool>[]>();
  private static threads = new Map<number, Thread>();

  static registerPool(
    pool: ReapablePool,
    frequency: number,
  ): WeakRef<ReapablePool>[] | Promise<WeakRef<ReapablePool>[]> {
    return Reaper.mutex.synchronize(() => {
      if (!Reaper.threads.get(frequency)?.isAlive()) {
        Reaper.threads.set(frequency, Reaper.spawnThread(frequency));
      }
      if (!Reaper.pools.has(frequency)) Reaper.pools.set(frequency, []);
      const pools = Reaper.pools.get(frequency)!;
      pools.push(new WeakRef(pool));
      return pools;
    });
  }

  private static spawnThread(frequency: number): Thread {
    return new Thread(async () => {
      const t = frequency;
      Thread.current().threadVariableSet("fork_safe", true);
      Thread.current().name = "AR Pool Reaper";
      let running = true;
      while (running) {
        await new Promise((resolve) =>
          (setTimeout(resolve, t * 1000) as { unref?(): unknown }).unref?.(),
        );
        await Reaper.mutex.synchronize(async () => {
          selectBang(Reaper.pools.get(frequency)!, (ref) => {
            const pool = ref.deref();
            return pool !== undefined && !pool.isDiscarded();
          });

          for (const p of Reaper.pools.get(frequency)!) {
            const pool = p.deref();
            if (pool === undefined) continue;
            await pool.reap();
            await pool.flush();
          }

          if (isEmpty(Reaper.pools.get(frequency)!)) {
            Reaper.pools.delete(frequency);
            Reaper.threads.delete(frequency);
            running = false;
          }
        });
      }
    });
  }

  run(): WeakRef<ReapablePool>[] | Promise<WeakRef<ReapablePool>[]> | undefined {
    if (!(this.frequency && this.frequency > 0)) return;
    return Reaper.registerPool(this.pool, this.frequency);
  }
}
