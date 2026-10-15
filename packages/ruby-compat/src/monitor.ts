import { Mutex } from "./mutex.js";
import { Thread } from "./thread.js";
import { ThreadError } from "./thread-error.js";
import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

interface MonData {
  holders: Map<symbol | null, Promise<void> | null>;
  storage: AsyncContext<symbol> | null;
  adapter: AsyncContextAdapter | null;
}

const MON_DATA = new WeakMap<object, MonData>();

function monData(self: object): MonData {
  let data = MON_DATA.get(self);
  if (!data) {
    data = { holders: new Map([[null, null]]), storage: null, adapter: null };
    MON_DATA.set(self, data);
  }
  const adapter = getAsyncContext();
  if (!data.storage || data.adapter !== adapter) {
    data.storage = adapter.create<symbol>();
    data.adapter = adapter;
  }
  return data;
}

function heldBy(data: MonData): symbol | null {
  const store = data.storage!.getStore();
  return store !== undefined && data.holders.has(store) ? store : null;
}

/**
 * `vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:191` `mon_owned?`, true when the
 * current execution context holds the monitor.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_owned?`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:191`).
 */
export function isMonOwned(this: object): boolean {
  return heldBy(monData(this)) !== null;
}

/**
 * `vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:200` `mon_synchronize`, aliased
 * `synchronize` at `:203`.
 *
 * Ruby's monitor is owned by a thread, and one thread runs one call at a time,
 * so a re-entry is always nested inside the holder's own call. Concurrent
 * promises started inside a held block share its async context, so a
 * re-entry here is serialized against the other re-entries under the same
 * holder, each running under an owner of its own: a nested call re-enters at
 * once, and two sibling calls from one `Promise.all` take turns, as two
 * threads would.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#synchronize`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:200,203`).
 */
export async function synchronize<T>(this: object, block: () => T | Promise<T>): Promise<T> {
  const data = monData(this);
  const parent = heldBy(data);

  const predecessor = data.holders.get(parent)!;
  let monExit!: () => void;
  const mine = new Promise<void>((resolve) => {
    monExit = resolve;
  });
  const tail = predecessor ? predecessor.then(() => mine) : mine;
  data.holders.set(parent, tail);

  if (predecessor) await predecessor;

  const owner = Symbol("monitor");
  data.holders.set(owner, null);

  try {
    return await data.storage!.run(owner, () => block());
  } finally {
    data.holders.delete(owner);
    if (data.holders.get(parent) === tail) data.holders.set(parent, null);
    monExit();
  }
}

/**
 * `vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:91` `module MonitorMixin`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:91`).
 */
export interface MonitorMixin {
  isMonOwned(): boolean;
  synchronize<T>(block: () => T | Promise<T>): Promise<T>;
}

/**
 * `vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:256` `class Monitor`, which is
 * `MonitorMixin` on a bare object.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Monitor`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:256`).
 */
export class Monitor implements MonitorMixin {
  isMonOwned = isMonOwned;
  synchronize = synchronize;
}

interface MonCore {
  owner: Thread | null;
  count: number;
  mutex: Mutex;
}

const MON_CORE = new WeakMap<object, MonCore>();

function monCore(self: object): MonCore {
  let core = MON_CORE.get(self);
  if (!core) {
    core = { owner: null, count: 0, mutex: new Mutex() };
    MON_CORE.set(self, core);
  }
  return core;
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_enter`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:169`, `monitor_enter`, `ext/monitor/monitor.c:96`).
 */
export async function monEnter(this: object): Promise<void> {
  const core = monCore(this);
  if (core.owner !== Thread.current()) {
    await core.mutex.lock();
    core.owner = Thread.current();
  }
  core.count += 1;
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_exit`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:176`, `monitor_exit`, `ext/monitor/monitor.c:134`).
 */
export function monExit(this: object): void {
  const core = monCore(this);
  if (core.owner !== Thread.current()) throw new ThreadError("current thread not owner");
  core.count -= 1;
  if (core.count === 0) {
    core.owner = null;
    core.mutex.unlock();
  }
}

/**
 * The monitor `ext/monitor/monitor.c` implements: reentrant per thread, and
 * released by `MonitorMixin::ConditionVariable#wait` for the length of the
 * wait, so a condition re-checked after a wake and the code after it run
 * under the monitor as one step.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_synchronize`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:200`, `monitor_synchronize`, `ext/monitor/monitor.c:236`).
 */
export async function monSynchronize<T>(this: object, block: () => T | Promise<T>): Promise<T> {
  await monEnter.call(this);
  try {
    return await block();
  } finally {
    monExit.call(this);
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin::ConditionVariable`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:98`).
 */
export class MonitorConditionVariable {
  #monitor: object;
  #waiters: Array<() => void> = [];

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin::ConditionVariable#initialize`
   * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:146`).
   */
  constructor(monitor: object) {
    this.#monitor = monitor;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin::ConditionVariable#wait`
   * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:105`, `monitor_wait_for_cond`, `ext/monitor/monitor.c:200`).
   */
  async wait(timeout: number | null = null): Promise<void> {
    const core = monCore(this.#monitor);
    if (core.owner !== Thread.current()) throw new ThreadError("current thread not owner");
    const count = core.count;
    core.owner = null;
    core.count = 0;
    core.mutex.unlock();
    try {
      await new Promise<void>((resolve) => {
        this.#waiters.push(resolve);
        if (timeout != null) {
          setTimeout(() => {
            const index = this.#waiters.indexOf(resolve);
            if (index >= 0) this.#waiters.splice(index, 1);
            resolve();
          }, timeout * 1000);
        }
      });
    } finally {
      await core.mutex.lock();
      core.owner = Thread.current();
      core.count = count;
    }
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin::ConditionVariable#wait_while`
   * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:113`).
   */
  async waitWhile(block: () => unknown): Promise<void> {
    while (block()) {
      await this.wait();
    }
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin::ConditionVariable#broadcast`
   * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:139`).
   */
  broadcast(): void {
    const core = monCore(this.#monitor);
    if (core.owner !== Thread.current()) throw new ThreadError("current thread not owner");
    const waiters = this.#waiters;
    this.#waiters = [];
    for (const resolve of waiters) resolve();
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#new_cond`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:209`).
 */
export function newCond(this: object): MonitorConditionVariable {
  return new MonitorConditionVariable(this);
}
