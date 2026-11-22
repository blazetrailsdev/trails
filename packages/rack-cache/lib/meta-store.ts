import {
  ARGV,
  Digest,
  Dir,
  Errno,
  File,
  FileUtils,
  IOError,
  Marshal,
  NotImplementedError,
  rbModName,
  rbObjDup,
  rbClassNewInstance,
  rbProcCall,
  toI,
  toS,
  warn,
} from "@blazetrails/ruby-compat";
import { Noop } from "./entity-store.js";
import { Key } from "./key.js";
import type { Request } from "./request.js";
import { Response } from "./response.js";

type Env = Record<string, unknown>;
type StoredHeaders = Response["headers"];
type Entry = [Env, StoredHeaders];
type EntityStore = {
  open(key: string): Promise<unknown>;
  write(body: unknown, ttl?: number | null): Promise<[string, number] | null>;
};

let warnedOnPurge = false;

export class MetaStore {
  static Heap: typeof Heap;
  static HEAP: typeof Heap;
  static MEM: typeof Heap;
  static Disk: typeof Disk;
  static DISK: typeof Disk;
  static FILE: typeof Disk;

  async lookup(request: Request, entityStore: EntityStore): Promise<Response | null> {
    const key = this.cacheKey(request);
    const entries = await this.read(key);

    if (entries.length === 0) return null;

    const env = request.env;
    const match = entries.find(([req, res]) =>
      this.isRequestsMatch(res.get("vary") ?? res.get("vary"), env, req),
    );
    if (match == null) return null;

    const [, res] = match;
    const entityKey = res.get("x-content-digest");
    let body: unknown;
    if (entityKey != null && (body = await entityStore.open(entityKey)) != null) {
      return this.restoreResponse(res, body);
    } else {
      try {
        return await this.purge(key);
      } catch (error) {
        if (!(error instanceof NotImplementedError)) throw error;
        warnedOnPurge ||=
          (warn(
            `WARNING: Future releases may require purge implementation for ${rbModName(this.constructor)}`,
          ),
          true);
        return null;
      }
    }
  }

  async store(request: Request, response: Response, entityStore: EntityStore): Promise<string> {
    const key = this.cacheKey(request);
    const storedEnv = this.persistRequest(request);

    if (response.headers.get("x-content-digest") == null) {
      let digest: string | undefined, size: number | undefined;
      if (
        request.env["rack-cache.use_native_ttl"] != null &&
        request.env["rack-cache.use_native_ttl"] !== false &&
        response.isFresh()
      ) {
        [digest, size] = (await entityStore.write(response.body, response.ttl)) ?? [];
      } else {
        [digest, size] = (await entityStore.write(response.body)) ?? [];
      }
      response.headers.set("x-content-digest", digest!);
      if (response.headers.get("Transfer-Encoding") == null) {
        response.headers.set("content-length", toS(size));
      }

      if (!(entityStore instanceof Noop)) {
        response.body = (await entityStore.open(digest!)) ?? response.body;
      }
    }

    const vary = response.vary;
    const entries = (await this.read(key)).filter(
      ([env, res]) =>
        !(vary === (res.get("vary") ?? null) && this.isRequestsMatch(vary, env, storedEnv)),
    );

    const headers = this.persistResponse(response);
    headers.delete("age");

    entries.unshift([storedEnv, headers]);
    if (
      request.env["rack-cache.use_native_ttl"] != null &&
      request.env["rack-cache.use_native_ttl"] !== false &&
      response.isFresh()
    ) {
      await this.write(key, entries, response.ttl);
    } else {
      await this.write(key, entries);
    }
    return key;
  }

  cacheKey(request: Request): string {
    const keygen =
      request.env["rack-cache.cache_key"] != null && request.env["rack-cache.cache_key"] !== false
        ? request.env["rack-cache.cache_key"]
        : Key;
    return rbProcCall(keygen, request) as string;
  }

  async invalidate(request: Request, _entityStore: EntityStore | null): Promise<unknown> {
    let modified = false;
    const key = this.cacheKey(request);
    const entries = (await this.read(key)).map(([req, res]): Entry => {
      const response = this.restoreResponse(res);
      if (response.isFresh()) {
        response.expireBang();
        modified = true;
      }
      return [req, this.persistResponse(response)];
    });
    if (modified) return this.write(key, entries);
    return null;
  }

  /** @internal */
  private persistRequest(request: Request): Env {
    const env: Env = { ...request.env };
    for (const [key, val] of Object.entries(env)) {
      if (/[^0-9A-Z_]/.test(key) || typeof val !== "string") delete env[key];
    }
    return env;
  }

  /** @internal */
  private restoreResponse(hash: StoredHeaders, body: unknown = []): Response {
    const status = toI(hash.delete("x-status")) as number;
    return new Response(status, hash, body);
  }

  /** @internal */
  private persistResponse(response: Response): StoredHeaders {
    const hash = rbObjDup(response.headers);
    hash.set("x-status", toS(response.status));
    return hash;
  }

  /** @internal */
  private isRequestsMatch(vary: string | null | undefined, env1: Env, env2: Env): boolean {
    if (vary == null || vary === "") return true;
    return vary.split(/[\s,]+/).every((header) => {
      const key = `HTTP_${header.toUpperCase().replaceAll("-", "_")}`;
      return env1[key] === env2[key];
    });
  }

  /** @internal */
  protected async read(_key: string): Promise<Entry[]> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async write(
    _key: string,
    _negotiations: Entry[],
    _ttl: number | null = null,
  ): Promise<unknown> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async purge(_key: string): Promise<null> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected hexdigest(data: string | Uint8Array): string {
    return Digest.SHA1.hexdigest(data);
  }
}

export class Heap extends MetaStore {
  /** @internal */
  private _hash: Record<string, Uint8Array>;

  /** @internal */
  private _options: Record<string, unknown>;

  constructor(hash: Record<string, Uint8Array> = {}, options: Record<string, unknown> = {}) {
    super();
    this._hash = hash;
    this._options = options;
  }

  override async read(key: string): Promise<Entry[]> {
    const data = Object.hasOwn(this._hash, key) ? this._hash[key] : null;
    if (data != null) {
      return Marshal.load(data) as Entry[];
    } else {
      return [];
    }
  }

  /** @missingRailsArgs dump — PERMANENT */
  override async write(
    key: string,
    entries: Entry[],
    _ttl: number | null = null,
  ): Promise<Uint8Array> {
    return (this._hash[key] = Marshal.dump(entries, -1, true));
  }

  override async purge(key: string): Promise<null> {
    delete this._hash[key];
    return null;
  }

  toHash(): Record<string, Uint8Array> {
    return this._hash;
  }

  static resolve(_uri: unknown, options: Record<string, unknown> = {}): Heap {
    return new this({}, options);
  }
}

MetaStore.Heap = Heap;
MetaStore.HEAP = Heap;
MetaStore.MEM = Heap;

export class Disk extends MetaStore {
  readonly root: string;

  protected constructor(root: string = `/tmp/rack-cache/meta-${ARGV[0]}`) {
    super();
    this.root = File.expandPath(root);
  }

  static async new(root?: string): Promise<Disk> {
    const store = rbClassNewInstance(this, root) as Disk;
    await FileUtils.mkdirPAsync(root ?? `/tmp/rack-cache/meta-${ARGV[0]}`, { mode: 0o755 });
    return store;
  }

  override async read(key: string): Promise<Entry[]> {
    try {
      const path = this.keyPath(key);
      return (await File.openAsync(path, "rb", async (io) =>
        Marshal.load(await io.readAsync()),
      )) as Entry[];
    } catch (error) {
      if (error instanceof Errno.ENOENT || error instanceof IOError) return [];
      throw error;
    }
  }

  /** @missingRailsArgs dump — PERMANENT */
  override async write(
    key: string,
    entries: Entry[],
    _ttl: number | null = null,
  ): Promise<unknown> {
    let tries = 0;
    let path: string;
    for (;;) {
      try {
        path = this.keyPath(key);
        return await File.openAsync(path, "wb", (io) =>
          io.writeAsync(Marshal.dump(entries, -1, true)),
        );
      } catch (error) {
        if (!(error instanceof Errno.ENOENT || error instanceof IOError)) throw error;
        await Dir.mkdirAsync(File.dirname(path!), 0o755);
        if ((tries += 1) === 1) continue;
        return null;
      }
    }
  }

  override async purge(key: string): Promise<null> {
    try {
      const path = this.keyPath(key);
      await File.deleteAsync(path);
      return null;
    } catch (error) {
      if (error instanceof Errno.ENOENT || error instanceof IOError) return null;
      throw error;
    }
  }

  /** @internal */
  private keyPath(key: string): string {
    return File.join(this.root, this.spread(this.hexdigest(key)));
  }

  /** @internal */
  private spread(sha: string, n: number = 2): string {
    return `${sha.slice(0, n)}/${sha.slice(n)}`;
  }

  static async resolve(uri: { opaque: string | null; path: string }): Promise<Disk> {
    const path = File.expandPath(uri.opaque ?? uri.path);
    return this.new(path);
  }
}

MetaStore.Disk = Disk;
MetaStore.DISK = Disk;
MetaStore.FILE = Disk;
