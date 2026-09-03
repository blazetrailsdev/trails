import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "@blazetrails/ruby-compat";

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

export interface MonitorMixin {
  synchronize<T>(block: () => T | Promise<T>): Promise<T>;
}

export class Monitor implements MonitorMixin {
  synchronize = synchronize;
}
