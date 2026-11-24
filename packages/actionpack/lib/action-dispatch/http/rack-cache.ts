import { EntityStore, MetaStore } from "@blazetrails/rack-cache";
import { Marshal } from "@blazetrails/ruby-compat/marshal";
import { TopLevel } from "@blazetrails/ruby-compat/object";

type Store = {
  read(key: unknown): unknown;
  write(key: unknown, value: unknown): unknown;
  isExist?(key: unknown): unknown;
};

type Part = string | Uint8Array;
type Entry = Awaited<ReturnType<InstanceType<typeof MetaStore.Heap>["read"]>>[number];
type RackBody = Iterable<Part> | { each(block: (part: Part) => unknown): unknown };

declare module "@blazetrails/rack-cache" {
  namespace MetaStore {
    let RAILS: typeof RailsMetaStore;
  }
  namespace EntityStore {
    let RAILS: typeof RailsEntityStore;
  }
}

export class RailsMetaStore extends MetaStore {
  static resolve(_uri: unknown): RailsMetaStore {
    return new this();
  }

  /** @internal */
  private _store: Store;

  constructor(store: Store = TopLevel.Trails!.cache as Store) {
    super();
    this._store = store;
  }

  override async read(key: string): Promise<Entry[]> {
    let data: unknown;
    if ((data = await this._store.read(key)) != null && data !== false) {
      return Marshal.load(data) as Entry[];
    } else {
      return [];
    }
  }

  override async write(key: string, value: Entry[]): Promise<unknown> {
    return await this._store.write(key, Marshal.dump(value, -1, true));
  }
}

MetaStore.RAILS = RailsMetaStore;

export class RailsEntityStore extends EntityStore {
  static resolve(_uri: unknown): RailsEntityStore {
    return new this();
  }

  /** @internal */
  private _store: Store;

  constructor(store: Store = TopLevel.Trails!.cache as Store) {
    super();
    this._store = store;
  }

  async isExist(key: string): Promise<unknown> {
    return await this._store.isExist!(key);
  }

  async open(key: string): Promise<Part[] | null> {
    return (await this._store.read(key)) as Part[] | null;
  }

  async read(key: string): Promise<Part | null> {
    const body = await this.open(key);
    if (body == null) return null;
    if (!body.some((part) => part instanceof Uint8Array)) return body.join("");
    const encoder = new TextEncoder();
    const bytes = body.map((part) => (part instanceof Uint8Array ? part : encoder.encode(part)));
    const buf = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
    let offset = 0;
    for (const b of bytes) {
      buf.set(b, offset);
      offset += b.length;
    }
    return buf;
  }

  async write(body: RackBody): Promise<[string, number]> {
    const buf: Part[] = [];
    const [key, size] = await this.slurp(body, (part) => buf.push(part));
    await this._store.write(key, buf);
    return [key, size];
  }
}

EntityStore.RAILS = RailsEntityStore;
