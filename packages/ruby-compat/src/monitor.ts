import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";

interface MonData {
  owner: symbol | null;
  chain: Promise<void> | null;
  storage: AsyncContext<symbol> | null;
  adapter: AsyncContextAdapter | null;
}

const MON_DATA = new WeakMap<object, MonData>();

function monData(self: object): MonData {
  let data = MON_DATA.get(self);
  if (!data) {
    data = { owner: null, chain: null, storage: null, adapter: null };
    MON_DATA.set(self, data);
  }
  const adapter = getAsyncContext();
  if (!data.storage || data.adapter !== adapter) {
    data.storage = adapter.create<symbol>();
    data.adapter = adapter;
  }
  return data;
}

/**
 * `vendor/ruby/ext/monitor/lib/monitor.rb:200` `mon_synchronize`, aliased
 * `synchronize` at `:203`.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `MonitorMixin#synchronize`
 * (`vendor/ruby/ext/monitor/lib/monitor.rb:200,203`).
 */
export async function synchronize<T>(this: object, block: () => T | Promise<T>): Promise<T> {
  const data = monData(this);
  const storage = data.storage!;

  if (data.owner !== null && storage.getStore() === data.owner) {
    return await block();
  }

  const predecessor = data.chain;
  let monExit!: () => void;
  const mine = new Promise<void>((resolve) => {
    monExit = resolve;
  });
  const tail = predecessor ? predecessor.then(() => mine) : mine;
  data.chain = tail;

  if (predecessor) await predecessor;

  const owner = Symbol("monitor");
  data.owner = owner;

  try {
    return await storage.run(owner, () => block());
  } finally {
    data.owner = null;
    if (data.chain === tail) data.chain = null;
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
  synchronize = synchronize;
}
