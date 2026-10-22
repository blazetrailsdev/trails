import { Zlib } from "./zlib.js";

/**
 * The compression seam. `zlib` is a C extension in MRI and a builtin in Node,
 * so like `fs`, `os` and `crypto` it is reached through a registry rather than
 * a static import — a browser bundle that pulls a compressing module then fails
 * at the call rather than at bundle time.
 *
 * @noRailsEquivalent PERMANENT — the platform seam under Ruby stdlib `Zlib`
 * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4659`); Rails calls `Zlib`, and neither Rails
 * nor Ruby declares the backend registry a JS runtime needs.
 */
export interface ZlibAdapter {
  gzip(data: Uint8Array, level: number, strategy: number): Uint8Array;
  gunzip(data: Uint8Array): Uint8Array;
  deflate(data: Uint8Array): Uint8Array;
  inflate(data: Uint8Array): Uint8Array;
  /**
   * Everything `data`, a possibly truncated stream, inflates to so far:
   * zlib's `Z_SYNC_FLUSH` finish, which `Zlib::Inflate#inflate` reaches one
   * chunk at a time (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2145`). `windowBits`
   * picks the format as `inflateInit2` does: negative is raw deflate, `+ 32`
   * detects zlib or gzip.
   */
  inflateStream(data: Uint8Array, windowBits: number): Uint8Array;
  gzipWriter(io: GzipWriterIO): GzipWriterHandle;
  gzipReader(io: GzipReaderIO): GzipReaderHandle;
}

/**
 * The object `::Zlib::GzipWriter.new` wraps (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3841`
 * `rb_gzwriter_initialize`) — anything that responds to `write`.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface GzipWriterIO {
  write(data: Uint8Array): void;
}

/** @noRailsEquivalent PERMANENT */
export interface GzipWriterHandle {
  mtime: number | null;
  write(data: Uint8Array): void;
  flush(): Promise<void>;
  finish(): Promise<void>;
}

/**
 * The object `::Zlib::GzipReader.new` wraps (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3944`
 * `rb_gzreader_initialize`) — anything that responds to `read(length)`, which
 * `gzfile_read_raw` pulls `GZFILE_READ_SIZE` bytes at a time from
 * (`zlib.c:2376,2542`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface GzipReaderIO {
  read(length: number): string | Uint8Array | null;
}

/**
 * The inflate half of the streaming pair: `read` feeds the associated IO into
 * the zstream chunk by chunk (`gzfile_read_more`, `vendor/ruby/v3.3.11/ext/zlib/zlib.c:2823`)
 * and answers what `gzfile_read_all` (`zlib.c:2946`) detaches.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface GzipReaderHandle {
  /**
   * The header's MTIME field, read by `gzfile_read_header`, which raises
   * "not in gzip format" on a short or unmagic header
   * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2709-2717,2743`).
   */
  readonly mtime: number;
  read(): Promise<Uint8Array>;
}

/**
 * Ruby stdlib's `Zlib::GzipWriter` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3841`), the
 * streaming counterpart of one-shot `Zlib.gzip` — `Rack::Deflater::GzipStream#each`
 * writes into it and reads the compressed bytes back through the io it wraps
 * (`vendor/rack/v3.1.14/lib/rack/deflater.rb:101`). Node's gzip stream is asynchronous,
 * so `finish` is awaited where Ruby's returns.
 *
 * @noRailsEquivalent PERMANENT — the platform seam under Ruby stdlib `Zlib`
 * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3841`); Rails calls `Zlib`, and neither Rails
 * nor Ruby declares the backend registry a JS runtime needs.
 */
export class GzipWriter implements GzipWriterHandle {
  private readonly handle: GzipWriterHandle;
  private headerFinished = false;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: GzipWriterIO) {
    this.handle = resolve().gzipWriter(io);
  }

  /** @noRailsEquivalent PERMANENT */
  get mtime(): number | null {
    return this.handle.mtime;
  }

  /** @noRailsEquivalent PERMANENT */
  set mtime(value: number | null) {
    if (this.headerFinished) {
      throw new Zlib.GzipFile.Error("header is already written");
    }
    this.handle.mtime = value;
  }

  /** @noRailsEquivalent PERMANENT */
  write(data: Uint8Array): void {
    this.headerFinished = true;
    this.handle.write(data);
  }

  /** @noRailsEquivalent PERMANENT */
  async flush(): Promise<void> {
    this.headerFinished = true;
    await this.handle.flush();
  }

  /** @noRailsEquivalent PERMANENT */
  async finish(): Promise<void> {
    await this.handle.finish();
  }
}

const registry = new Map<string, ZlibAdapter>();
let currentAdapterName: string | null = null;
let resolved: ZlibAdapter | null = null;

/** @noRailsEquivalent PERMANENT */
export function registerZlibAdapter(name: string, adapter: ZlibAdapter): void {
  registry.set(name, adapter);
  if (name === currentAdapterName) resolved = null;
}

let nodeAttempted = false;

interface NodeProcess {
  versions?: { node?: string };
  getBuiltinModule?(id: string): unknown;
}

function nodeProcess(): NodeProcess | undefined {
  return (globalThis as { process?: NodeProcess }).process;
}

declare const require: ((id: string) => unknown) | undefined;

function syncBuiltinLoader(): ((id: string) => unknown) | null {
  const proc = nodeProcess();
  const getBuiltinModule = proc?.getBuiltinModule;
  if (typeof getBuiltinModule === "function") return (id) => getBuiltinModule.call(proc, id);
  if (typeof require === "undefined") return null;
  const nodeModule = require("node:module") as {
    createRequire(p: string): (id: string) => unknown;
  };
  return nodeModule.createRequire("file:///ruby-compat");
}

/**
 * `gzfile_make_header` writes the mtime as a 4-byte little-endian field at
 * offset 4 of the 10-byte gzip header (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2648,2672`).
 * Node's `createGzip` has no option for it, so the backend patches the field
 * into the first emitted chunk — which carries that header — to reproduce
 * `Zlib::GzipWriter#mtime=` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3356`), and the `time(0)` it
 * defaults to when unset (`zlib.c:2658-2660`).
 */
const GZIP_HEADER_LENGTH = 10;

function setGzipHeaderMtime(header: Uint8Array, mtime: number): void {
  header[4] = mtime & 0xff;
  header[5] = (mtime >>> 8) & 0xff;
  header[6] = (mtime >>> 16) & 0xff;
  header[7] = (mtime >>> 24) & 0xff;
}

type NodeGzipStream = {
  on(event: string, listener: (arg?: unknown) => void): void;
  write(data: Uint8Array): boolean;
  once(event: string, listener: () => void): void;
  flush(callback: () => void): void;
  end(): void;
};

type NodeZlib = {
  gzipSync: (data: Uint8Array, options: { level: number; strategy: number }) => Uint8Array;
  gunzipSync: (data: Uint8Array) => Uint8Array;
  deflateSync: (data: Uint8Array) => Uint8Array;
  inflateSync: (data: Uint8Array, options?: { finishFlush: number }) => Uint8Array;
  inflateRawSync: (data: Uint8Array, options: { finishFlush: number }) => Uint8Array;
  unzipSync: (data: Uint8Array, options: { finishFlush: number }) => Uint8Array;
  createGzip: () => NodeGzipStream;
  createGunzip: () => NodeGzipStream;
};

const GZFILE_READ_SIZE = 2048;

const Z_SYNC_FLUSH = 2;

function wrap(zlib: NodeZlib): ZlibAdapter {
  return {
    gzip: (data, level, strategy) => zlib.gzipSync(data, { level, strategy }),
    gunzip: (data) => zlib.gunzipSync(data),
    deflate: (data) => zlib.deflateSync(data),
    inflate: (data) => zlib.inflateSync(data),
    inflateStream: (data, windowBits) => {
      const options = { finishFlush: Z_SYNC_FLUSH };
      if (windowBits < 0) return zlib.inflateRawSync(data, options);
      if (windowBits > 15) return zlib.unzipSync(data, options);
      return zlib.inflateSync(data, options);
    },
    gzipWriter: (io) => {
      const stream = zlib.createGzip();
      let headerSeen = false;
      let failure: Error | null = null;
      let pending = new Uint8Array();
      const writeRaw = (): void => {
        if (failure !== null || pending.length === 0) return;
        const dst = pending;
        pending = new Uint8Array();
        try {
          io.write(dst);
        } catch (err) {
          failure = err as Error;
        }
      };
      const handle: GzipWriterHandle = {
        mtime: null,
        write: (data) => stream.write(data),
        flush: async () => {
          await new Promise<void>((res) => stream.flush(res));
          writeRaw();
          if (failure !== null) throw failure;
        },
        finish: async () => {
          stream.end();
          await ended;
          writeRaw();
          if (failure !== null) throw failure;
        },
      };
      stream.on("data", (chunk) => {
        const bytes = chunk as Uint8Array;
        if (!headerSeen) {
          headerSeen = true;
          if (bytes.length >= GZIP_HEADER_LENGTH) {
            setGzipHeaderMtime(bytes, handle.mtime ?? Math.floor(Date.now() / 1000));
          }
        }
        const buf = new Uint8Array(pending.length + bytes.length);
        buf.set(pending);
        buf.set(bytes, pending.length);
        pending = buf;
      });
      const ended = new Promise<void>((res) => {
        stream.on("end", () => res());
        stream.on("error", (err) => {
          failure ??= err as Error;
          res();
        });
      });
      return handle;
    },
    gzipReader: (io) => {
      const stream = zlib.createGunzip();
      let chunks: Uint8Array[] = [];
      let failure: Error | null = null;
      stream.on("data", (chunk) => chunks.push(chunk as Uint8Array));
      const ended = new Promise<void>((res) => {
        stream.on("end", () => res());
        stream.on("error", (err) => {
          failure = err as Error;
          res();
        });
      });
      const toBytes = (str: string | Uint8Array): Uint8Array =>
        typeof str === "string" ? Uint8Array.from(str, (c) => c.charCodeAt(0) & 0xff) : str;
      const header = toBytes(io.read(GZIP_HEADER_LENGTH) ?? new Uint8Array());
      if (header.length < GZIP_HEADER_LENGTH || header[0] !== 0x1f || header[1] !== 0x8b) {
        throw new Zlib.GzipFile.Error("not in gzip format");
      }
      const mtime = (header[4] | (header[5] << 8) | (header[6] << 16) | (header[7] << 24)) >>> 0;
      stream.write(header);
      const readMore = async (): Promise<void> => {
        let str: string | Uint8Array | null;
        while (failure === null && (str = io.read(GZFILE_READ_SIZE)) !== null) {
          if (str.length === 0) continue;
          const bytes = toBytes(str);
          if (!stream.write(bytes)) {
            await new Promise<void>((res) => {
              stream.once("drain", res);
              void ended.then(res);
            });
          }
        }
        stream.end();
        await ended;
      };
      let finished: Promise<void> | null = null;
      return {
        mtime,
        read: async () => {
          finished ??= readMore();
          await finished;
          if (failure !== null) throw failure;
          const dst = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
          let offset = 0;
          for (const chunk of chunks) {
            dst.set(chunk, offset);
            offset += chunk.length;
          }
          chunks = [];
          return dst;
        },
      };
    },
  };
}

function tryAutoRegisterNode(): boolean {
  if (registry.has("node")) return true;
  if (nodeAttempted) return false;
  nodeAttempted = true;
  try {
    const proc = nodeProcess();
    if (proc === undefined || !proc.versions?.node) {
      return false;
    }
    const req = syncBuiltinLoader();
    if (!req) return false;
    registry.set("node", wrap(req("node:zlib") as NodeZlib));
    return true;
  } catch {
    return false;
  }
}

function resolve(): ZlibAdapter {
  if (resolved) return resolved;
  const name = currentAdapterName;
  if (name) {
    const reg = registry.get(name);
    if (!reg) throw new Error(`Zlib adapter "${name}" is not registered.`);
    resolved = reg;
    return reg;
  }
  if (tryAutoRegisterNode()) {
    resolved = registry.get("node")!;
    return resolved;
  }
  throw new Error(
    "No Zlib adapter configured. Under ESM, import '@blazetrails/activesupport/node' from your entry point; otherwise set ActiveSupport.zlibAdapter or register a custom adapter.",
  );
}

/** @noRailsEquivalent PERMANENT */
export function getZlib(): ZlibAdapter {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export async function getZlibAsync(): Promise<ZlibAdapter> {
  return resolve();
}

/** @noRailsEquivalent PERMANENT */
export const zlibAdapterConfig = {
  /** @noRailsEquivalent PERMANENT */
  get adapter(): string | null {
    return currentAdapterName;
  },
  /** @noRailsEquivalent PERMANENT */
  set adapter(name: string | null) {
    currentAdapterName = name;
    resolved = null;
  },
};
