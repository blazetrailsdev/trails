import {
  Digest,
  Errno,
  File,
  FileUtils,
  Process,
  StringIO,
  Thread,
  type Generic,
  camelized,
  each,
  extend,
  rbClassNewInstance,
  rbDeclareIvar,
  rbObjId,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { Utils } from "@blazetrails/rack";
import type { Client as DalliClient } from "memjs";

type Part = string | Uint8Array;
type RackBody = (Iterable<Part> | { each(block: (part: Part) => unknown): unknown }) & {
  close?: () => unknown;
};

export class EntityStore {
  static Heap: typeof Heap;
  static HEAP: typeof Heap;
  static MEM: typeof Heap;
  static Noop: typeof Noop;
  static NOOP: typeof Noop;
  static Disk: typeof Disk;
  static DISK: typeof Disk;
  static FILE: typeof Disk;
  static MemCacheBase: typeof MemCacheBase;
  static Dalli: typeof Dalli;
  static MEMCACHE: typeof Dalli;
  static MEMCACHED: typeof Dalli;

  /** @internal */
  protected async slurp(body: RackBody, block: (part: Part) => unknown): Promise<[string, number]> {
    const digest = Digest.SHA1.new();
    let size = 0;
    const yieldPart = (part: Part): unknown => {
      size += this.bytesize(part);
      digest.update(part);
      return block(part);
    };
    if (Symbol.iterator in body) {
      for (const part of body) await yieldPart(part);
    } else if (body instanceof File) {
      for await (const part of body.eachAsync()) await yieldPart(part);
    } else {
      let yielded: unknown = null;
      await each(body, (part) => (yielded = Promise.resolve(yielded).then(() => yieldPart(part))));
      await yielded;
    }
    if (rbObjRespondTo(body, "close")) await body.close!();
    return [digest.hexdigest(), size];
  }

  /** @internal */
  protected bytesize(string: Part): number {
    return string instanceof Uint8Array ? string.length : new TextEncoder().encode(string).length;
  }
}

export class Heap extends EntityStore {
  /** @internal */
  private _hash: Record<string, Part[]>;

  /** @internal */
  private _options: Record<string, unknown>;

  constructor(hash: Record<string, Part[]> = {}, options: Record<string, unknown> = {}) {
    super();
    this._hash = hash;
    this._options = options;
  }

  async isExist(key: string): Promise<boolean> {
    return Object.hasOwn(this._hash, key);
  }

  async open(key: string): Promise<Part[] | null> {
    const body = Object.hasOwn(this._hash, key) ? this._hash[key] : null;
    return body && [...body];
  }

  async read(key: string): Promise<Part | null> {
    const body = Object.hasOwn(this._hash, key) ? this._hash[key] : null;
    if (body == null) return body;
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

  async write(body: RackBody, _ttl: number | null = null): Promise<[string, number]> {
    const buf: Part[] = [];
    const [key, size] = await this.slurp(body, (part) => buf.push(part));
    this._hash[key] = buf;
    return [key, size];
  }

  async purge(key: string): Promise<null> {
    delete this._hash[key];
    return null;
  }

  static resolve(_uri: unknown, options: Record<string, unknown> = {}): Heap {
    return new this({}, options);
  }
}

EntityStore.Heap = Heap;
rbDeclareIvar(Heap, "@options", "_options");
EntityStore.HEAP = Heap;
EntityStore.MEM = Heap;

export class Noop extends EntityStore {
  async isExist(_key: string): Promise<boolean> {
    return true;
  }

  async read(_key: string): Promise<string> {
    return "";
  }

  async open(_key: string): Promise<Part[]> {
    return [];
  }

  async write(body: RackBody, _ttl: number | null = null): Promise<[string, number]> {
    const [key, size] = await this.slurp(body, (part) => part);
    return [key, size];
  }

  async purge(_key: string): Promise<null> {
    return null;
  }

  static resolve(_uri: unknown): Noop {
    return new this();
  }
}

EntityStore.Noop = Noop;
EntityStore.NOOP = Noop;

export class Disk extends EntityStore {
  static Body: typeof Body;

  readonly root: string;

  protected constructor(root: string) {
    super();
    this.root = root;
  }

  static async new(root: string): Promise<Disk> {
    const store = rbClassNewInstance(this, root) as Disk;
    await FileUtils.mkdirPAsync(root, { mode: 0o755 });
    return store;
  }

  async isExist(key: string): Promise<boolean> {
    return File.isExistAsync(this.bodyPath(key));
  }

  async read(key: string): Promise<Part | null> {
    try {
      return await File.openAsync(this.bodyPath(key), "rb", (f) => f.readAsync());
    } catch (error) {
      if (error instanceof Errno.ENOENT) return null;
      throw error;
    }
  }

  async open(key: string): Promise<Body | null> {
    try {
      return await Body.openAsync(this.bodyPath(key), "rb");
    } catch (error) {
      if (error instanceof Errno.ENOENT) return null;
      throw error;
    }
  }

  async write(body: RackBody, _ttl: number | null = null): Promise<[string, number]> {
    const filename = ["buf", Process.pid, rbObjId(Thread.current())].join("-");
    const tempFile = this.storagePath(filename);
    const [key, size] = await File.openAsync(tempFile, "wb", (dest) =>
      this.slurp(body, (part) => dest.writeAsync(part)),
    );

    const path = this.bodyPath(key);
    if (await File.isExistAsync(path)) {
      await File.deleteAsync(tempFile);
    } else {
      await FileUtils.mkdirPAsync(File.dirname(path), { mode: 0o755 });
      await FileUtils.mvAsync(tempFile, path);
    }
    return [key, size];
  }

  async purge(key: string): Promise<null> {
    try {
      await File.deleteAsync(this.bodyPath(key));
      return null;
    } catch (error) {
      if (error instanceof Errno.ENOENT) return null;
      throw error;
    }
  }

  /** @internal */
  protected storagePath(stem: string): string {
    return File.join(this.root, stem);
  }

  /** @internal */
  protected spread(key: string): string {
    return `${key.slice(0, 2)}/${key.slice(2)}`;
  }

  /** @internal */
  protected bodyPath(key: string): string {
    return this.storagePath(this.spread(key));
  }

  static async resolve(uri: { opaque: string | null; path: string }): Promise<Disk> {
    const path = File.expandPath(uri.opaque ?? uri.path);
    return this.new(path);
  }
}

export class Body extends File {
  /**
   * @missingRailsCall read — PERMANENT
   * @noRailsEquivalent PERMANENT
   */
  override async *eachAsync(): AsyncGenerator<Uint8Array> {
    let part: Uint8Array | null;
    while ((part = await this.readAsync(8192)) != null) {
      yield part;
    }
  }

  override toPath(): string | null {
    return this.path();
  }
}

Disk.Body = Body;

EntityStore.Disk = Disk;
EntityStore.DISK = Disk;
EntityStore.FILE = Disk;

export class MemCacheBase extends EntityStore {
  cache!: DalliClient;

  async open(key: string): Promise<Part[] | null> {
    const data = await (this as unknown as Dalli).read(key);
    return data != null ? [data] : null;
  }

  static async resolve(uri: unknown): Promise<MemCacheBase> {
    if (rbObjRespondTo(uri, "scheme")) {
      const { host, port, query, path } = uri as Generic;
      const server = `${host}:${port ?? "11211"}`;
      const options: Record<string, unknown> = (this as unknown as typeof Utils).parseQuery(
        query ?? "",
      );
      for (const key of Object.keys(options)) {
        let value: unknown = options[key];
        delete options[key];
        value = value === "true" ? true : value === "false" ? false : value;
        options[camelized(key)] = value;
      }
      options.namespace = path!.replace(/^\//, "");
      return (this as unknown as typeof Dalli).new(server, options);
    } else {
      return (this as unknown as typeof Dalli).new(uri);
    }
  }
}

extend(MemCacheBase, Utils);

export class Dalli extends MemCacheBase {
  /** @missingRailsCall new — PERMANENT */
  protected constructor(
    _server: unknown = "localhost:11211",
    _options: Record<string, unknown> = {},
  ) {
    super();
  }

  /** @missingRailsCall require — PERMANENT */
  static async new(
    server: unknown = "localhost:11211",
    options: Record<string, unknown> = {},
  ): Promise<Dalli> {
    const store = rbClassNewInstance(this, server, options) as Dalli;
    store.cache = rbObjRespondTo(server, "stats")
      ? (server as DalliClient)
      : (await import("memjs")).Client.create(server as string, options);
    return store;
  }

  async isExist(key: string): Promise<boolean> {
    return (await this.cache.get(key)).value != null;
  }

  async read(key: string): Promise<Part | null> {
    let { value: data } = await this.cache.get(key);
    if (data instanceof Uint8Array)
      data = new Uint8Array(data.buffer, data.byteOffset, data.length);
    return data;
  }

  /** @missingRailsArgs set — PERMANENT */
  async write(body: RackBody, ttl: number | null = null): Promise<[string, number] | null> {
    const buf = new StringIO(new Uint8Array(0));
    const [key, size] = await this.slurp(body, (part) => buf.write(part));
    if (await this.cache.set(key, buf.string(), { expires: ttl })) return [key, size];
    return null;
  }

  async purge(key: string): Promise<null> {
    await this.cache.delete(key);
    return null;
  }
}

EntityStore.MemCacheBase = MemCacheBase;
EntityStore.Dalli = Dalli;
EntityStore.MEMCACHE = Dalli;
EntityStore.MEMCACHED = EntityStore.MEMCACHE;
