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
 * `vendor/ruby/ext/monitor/lib/monitor.rb:191` `mon_owned?`, true when the
 * current execution context holds the monitor.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#mon_owned?`
 * (`vendor/ruby/ext/monitor/lib/monitor.rb:191`).
 */
export function isMonOwned(this: object): boolean {
  return heldBy(monData(this)) !== null;
}

/**
 * `vendor/ruby/ext/monitor/lib/monitor.rb:200` `mon_synchronize`, aliased
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
 * (`vendor/ruby/ext/monitor/lib/monitor.rb:200,203`).
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
 * `vendor/ruby/ext/monitor/lib/monitor.rb:91` `module MonitorMixin`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin`
 * (`vendor/ruby/ext/monitor/lib/monitor.rb:91`).
 */
export interface MonitorMixin {
  isMonOwned(): boolean;
  synchronize<T>(block: () => T | Promise<T>): Promise<T>;
}

/**
 * `vendor/ruby/ext/monitor/lib/monitor.rb:256` `class Monitor`, which is
 * `MonitorMixin` on a bare object.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Monitor`
 * (`vendor/ruby/ext/monitor/lib/monitor.rb:256`).
 */
export class Monitor implements MonitorMixin {
  isMonOwned = isMonOwned;
  synchronize = synchronize;
}
