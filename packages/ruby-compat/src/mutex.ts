import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";
import { ThreadError } from "./thread-error.js";

interface MutexData {
  fiber: symbol | null;
  chain: Promise<void> | null;
  storage: AsyncContext<symbol> | null;
  adapter: AsyncContextAdapter | null;
}

const MUTEX_DATA = new WeakMap<object, MutexData>();

function mutexData(self: object): MutexData {
  let data = MUTEX_DATA.get(self);
  if (!data) {
    data = { fiber: null, chain: null, storage: null, adapter: null };
    MUTEX_DATA.set(self, data);
  }
  const adapter = getAsyncContext();
  if (!data.storage || data.adapter !== adapter) {
    data.storage = adapter.create<symbol>();
    data.adapter = adapter;
  }
  return data;
}

/**
 * `vendor/ruby/thread_sync.c:1650` `rb_cMutex`, Ruby's non-reentrant mutual
 * exclusion primitive.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Mutex`
 * (`vendor/ruby/thread_sync.c:1650`).
 */
export class Mutex {
  /**
   * `vendor/ruby/thread_sync.c:697` `rb_mutex_synchronize_m`.
   *
   * Unlike `Monitor#synchronize` this is NOT reentrant: `rb_mutex_lock` raises
   * `ThreadError, "deadlock; recursive locking"` when the locking fiber already
   * owns the mutex (`vendor/ruby/thread_sync.c:350-352`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Mutex#synchronize`
   * (`vendor/ruby/thread_sync.c:697`).
   */
  async synchronize<T>(block: () => T | Promise<T>): Promise<T> {
    const data = mutexData(this);
    const storage = data.storage!;

    if (data.fiber !== null && storage.getStore() === data.fiber) {
      throw new ThreadError("deadlock; recursive locking");
    }

    const predecessor = data.chain;
    let unlock!: () => void;
    const mine = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const tail = predecessor ? predecessor.then(() => mine) : mine;
    data.chain = tail;

    if (predecessor) await predecessor;

    const fiber = Symbol("mutex");
    data.fiber = fiber;

    try {
      return await storage.run(fiber, () => block());
    } finally {
      data.fiber = null;
      if (data.chain === tail) data.chain = null;
      unlock();
    }
  }
}
