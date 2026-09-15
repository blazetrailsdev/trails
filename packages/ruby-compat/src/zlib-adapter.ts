/**
 * The compression seam. `zlib` is a C extension in MRI and a builtin in Node,
 * so like `fs`, `os` and `crypto` it is reached through a registry rather than
 * a static import — a browser bundle that pulls a compressing module then fails
 * at the call rather than at bundle time.
 *
 * @noRailsEquivalent PERMANENT — the platform seam under Ruby stdlib `Zlib`
 * (`vendor/ruby/ext/zlib/zlib.c:4659`); Rails calls `Zlib`, and neither Rails
 * nor Ruby declares the backend registry a JS runtime needs.
 */
export interface ZlibAdapter {
  gzip(data: Uint8Array, level: number, strategy: number): Uint8Array;
  gunzip(data: Uint8Array): Uint8Array;
  deflate(data: Uint8Array): Uint8Array;
  inflate(data: Uint8Array): Uint8Array;
  gzipWriter(io: GzipWriterIO): GzipWriterHandle;
  gzipReader(io: GzipReaderIO): GzipReaderHandle;
}

/**
 * The object `::Zlib::GzipWriter.new` wraps (`vendor/ruby/ext/zlib/zlib.c:3841`
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
  flush(): void;
  finish(): Promise<void>;
}

/**
 * The object `::Zlib::GzipReader.new` wraps (`vendor/ruby/ext/zlib/zlib.c:3944`
 * `rb_gzreader_initialize`) — anything that responds to `read(length)`, which
 * `gzfile_read_raw` pulls `GZFILE_READ_SIZE` bytes at a time from
 * (`zlib.c:2376,2542`).
 *
 * @noRailsEquivalent PERMANENT
 */
export interface GzipReaderIO {
  read(length: number): string | null;
}

/**
 * The inflate half of the streaming pair: `read` feeds the associated IO into
 * the zstream chunk by chunk (`gzfile_read_more`, `vendor/ruby/ext/zlib/zlib.c:2823`)
 * and answers what `gzfile_read_all` (`zlib.c:2946`) detaches.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface GzipReaderHandle {
  read(): Promise<Uint8Array>;
}

/**
 * Ruby stdlib's `Zlib::GzipWriter` (`vendor/ruby/ext/zlib/zlib.c:3841`), the
 * streaming counterpart of one-shot `Zlib.gzip` — `Rack::Deflater::GzipStream#each`
 * writes into it and reads the compressed bytes back through the io it wraps
 * (`vendor/rack/lib/rack/deflater.rb:101`). Node's gzip stream is asynchronous,
 * so `finish` is awaited where Ruby's returns.
 *
 * @noRailsEquivalent PERMANENT — the platform seam under Ruby stdlib `Zlib`
 * (`vendor/ruby/ext/zlib/zlib.c:3841`); Rails calls `Zlib`, and neither Rails
 * nor Ruby declares the backend registry a JS runtime needs.
 */
export class GzipWriter implements GzipWriterHandle {
  private readonly handle: GzipWriterHandle;

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
    this.handle.mtime = value;
  }

  /** @noRailsEquivalent PERMANENT */
  write(data: Uint8Array): void {
    this.handle.write(data);
  }

  /** @noRailsEquivalent PERMANENT */
  flush(): void {
    this.handle.flush();
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
 * offset 4 of the 10-byte gzip header (`vendor/ruby/ext/zlib/zlib.c:2648,2672`).
 * Node's `createGzip` has no option for it, so the backend patches the field
 * into the first emitted chunk — which carries that header — to reproduce
 * `Zlib::GzipWriter#mtime=` (`vendor/ruby/ext/zlib/zlib.c:3356`).
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
  flush(): void;
  end(): void;
};

type NodeZlib = {
  gzipSync: (data: Uint8Array, options: { level: number; strategy: number }) => Uint8Array;
  gunzipSync: (data: Uint8Array) => Uint8Array;
  deflateSync: (data: Uint8Array) => Uint8Array;
  inflateSync: (data: Uint8Array) => Uint8Array;
  createGzip: () => NodeGzipStream;
  createGunzip: () => NodeGzipStream;
};

const GZFILE_READ_SIZE = 2048;

function wrap(zlib: NodeZlib): ZlibAdapter {
  return {
    gzip: (data, level, strategy) => zlib.gzipSync(data, { level, strategy }),
    gunzip: (data) => zlib.gunzipSync(data),
    deflate: (data) => zlib.deflateSync(data),
    inflate: (data) => zlib.inflateSync(data),
    gzipWriter: (io) => {
      const stream = zlib.createGzip();
      let headerSeen = false;
      let failure: Error | null = null;
      const handle: GzipWriterHandle = {
        mtime: null,
        write: (data) => stream.write(data),
        flush: () => stream.flush(),
        finish: async () => {
          stream.end();
          await ended;
          if (failure !== null) throw failure;
        },
      };
      stream.on("data", (chunk) => {
        const bytes = chunk as Uint8Array;
        if (!headerSeen) {
          headerSeen = true;
          if (handle.mtime !== null && bytes.length >= GZIP_HEADER_LENGTH) {
            setGzipHeaderMtime(bytes, handle.mtime);
          }
        }
        io.write(bytes);
      });
      const ended = new Promise<void>((res) => {
        stream.on("end", () => res());
        stream.on("error", (err) => {
          failure = err as Error;
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
      const readMore = async (): Promise<void> => {
        let str: string | null;
        while (failure === null && (str = io.read(GZFILE_READ_SIZE)) !== null) {
          if (str.length === 0) continue;
          const bytes = new Uint8Array(str.length);
          for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
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
      const finished = readMore();
      return {
        read: async () => {
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
