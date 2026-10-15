import { Thread } from "./thread.js";
import { ThreadError } from "./thread-error.js";
import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

type Owner = symbol | Thread;

interface MonEntry {
  owner: Owner;
  count: number;
  thread: Thread;
}

interface MonWaiter {
  parent: Owner | null;
  grant: () => void;
}

interface MonData {
  entries: MonEntry[];
  waiters: MonWaiter[];
  storage: AsyncContext<symbol> | null;
  adapter: AsyncContextAdapter | null;
}

const MON_DATA = new WeakMap<object, MonData>();

function monData(self: object): MonData {
  let data = MON_DATA.get(self);
  if (!data) {
    data = { entries: [], waiters: [], storage: null, adapter: null };
    MON_DATA.set(self, data);
  }
  const adapter = getAsyncContext();
  if (!data.storage || data.adapter !== adapter) {
    data.storage = adapter.create<symbol>();
    data.adapter = adapter;
  }
  return data;
}

function currentOwner(data: MonData): Owner {
  const store = data.storage!.getStore();
  const thread = Thread.current();
  if (data.entries.some((entry) => entry.owner === store && entry.thread === thread)) return store!;
  return thread;
}

function topOwner(data: MonData): Owner | null {
  return data.entries.at(-1)?.owner ?? null;
}

function wakeWaiter(data: MonData): void {
  const top = topOwner(data);
  const index = data.waiters.findIndex((waiter) => waiter.parent === top);
  if (index < 0) return;
  const [waiter] = data.waiters.splice(index, 1);
  waiter.grant();
}

function acquire(data: MonData, parent: Owner | null, entry: MonEntry): Promise<void> | void {
  if (topOwner(data) === parent && !data.waiters.some((waiter) => waiter.parent === parent)) {
    data.entries.push(entry);
    return;
  }
  return new Promise<void>((resolve) => {
    data.waiters.push({
      parent,
      grant: () => {
        data.entries.push(entry);
        resolve();
      },
    });
  });
}

function release(data: MonData, owner: Owner): MonEntry {
  let index = data.entries.length - 1;
  while (index >= 0 && data.entries[index].owner !== owner) index -= 1;
  if (index < 0) throw new ThreadError("current thread not owner");
  const [entry] = data.entries.splice(index, 1);
  wakeWaiter(data);
  return entry;
}

function parentFor(data: MonData, owner: Owner): Owner | null {
  return data.entries.some((entry) => entry.owner === owner) ? owner : null;
}

/**
 * `vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:191` `mon_owned?`, true when the
 * current execution context holds the monitor.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_owned?`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:191`).
 */
export function isMonOwned(this: object): boolean {
  const data = monData(this);
  const owner = currentOwner(data);
  return data.entries.some((entry) => entry.owner === owner);
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_enter`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:169`, `monitor_enter`, `ext/monitor/monitor.c:96`).
 */
export async function monEnter(this: object): Promise<void> {
  const data = monData(this);
  const owner = currentOwner(data);
  const top = data.entries.at(-1);
  if (top?.owner === owner) {
    top.count += 1;
    return;
  }
  await acquire(data, parentFor(data, owner), { owner, count: 1, thread: Thread.current() });
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_exit`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:176`, `monitor_exit`, `ext/monitor/monitor.c:134`).
 */
export function monExit(this: object): void {
  const data = monData(this);
  const owner = currentOwner(data);
  const top = data.entries.at(-1);
  if (top?.owner !== owner) throw new ThreadError("current thread not owner");
  top.count -= 1;
  if (top.count === 0) release(data, owner);
}

/**
 * `vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:200` `mon_synchronize`
 * (`monitor_synchronize`, `ext/monitor/monitor.c:236`), aliased `synchronize`
 * at `:203`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_synchronize`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:200`).
 */
export async function monSynchronize<T>(this: object, block: () => T | Promise<T>): Promise<T> {
  const data = monData(this);
  const owner = Symbol("monitor");
  const acquired = acquire(data, parentFor(data, currentOwner(data)), {
    owner,
    count: 1,
    thread: Thread.current(),
  });
  if (acquired) await acquired;
  try {
    return await data.storage!.run(owner, () => block());
  } finally {
    release(data, owner);
  }
}

/**
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#synchronize`
 * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:203`).
 */
export const synchronize = monSynchronize;

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
   * Gives the monitor up for the length of the wait, as `monitor_wait_for_cond`
   * does, so a condition re-checked after a wake and the code after it run under
   * the monitor as one step.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin::ConditionVariable#wait`
   * (`vendor/ruby/v3.3.11/ext/monitor/lib/monitor.rb:105`, `monitor_wait_for_cond`, `ext/monitor/monitor.c:200`).
   */
  async wait(timeout: number | null = null): Promise<void> {
    const data = monData(this.#monitor);
    const owner = currentOwner(data);
    if (topOwner(data) !== owner) throw new ThreadError("current thread not owner");
    const parent = data.entries.at(-2)?.owner ?? null;
    const entry = release(data, owner);
    try {
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const wake = () => {
          clearTimeout(timer);
          resolve();
        };
        this.#waiters.push(wake);
        if (timeout != null) {
          timer = setTimeout(() => {
            const index = this.#waiters.indexOf(wake);
            if (index >= 0) this.#waiters.splice(index, 1);
            resolve();
          }, timeout * 1000);
        }
      });
    } finally {
      await acquire(data, parent, entry);
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
    const data = monData(this.#monitor);
    if (topOwner(data) !== currentOwner(data)) throw new ThreadError("current thread not owner");
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
