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
   * `zstream_init_deflate` with `deflateInit2(level, Z_DEFLATED, windowBits, ...,
   * strategy)` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:1694`), which `gzfile_writer`
   * opens with `-MAX_WBITS` (`zlib.c:3670`).
   */
  deflateZStream(level: number, windowBits: number, strategy: number): ZStream;
  /**
   * `zstream_init_inflate` with `inflateInit2(windowBits)`, `-MAX_WBITS` for a
   * gzip file (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3949`): negative is raw
   * deflate, `+ 32` detects zlib or gzip.
   */
  inflateZStream(windowBits: number): ZStream;
}

/**
 * MRI's `struct zstream` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:562`), run
 * synchronously: `run` is `zstream_run` (`zlib.c:1190`) over `input` and `src`,
 * answering what the stream produced, and leaving in `input` what it did not
 * consume once the stream has ended.
 *
 * @noRailsEquivalent PERMANENT
 */
export interface ZStream {
  input: Uint8Array;
  totalIn: number;
  readonly totalOut: number;
  run(src: Uint8Array, flush: number): Uint8Array;
  /**
   * `ZSTREAM_IS_FINISHED` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:587`). Node's
   * binding answers zlib's `Z_STREAM_END` only through input it leaves
   * unconsumed, so a stream that ended exactly at the end of its input is asked
   * with an empty `Z_FINISH` when `atEnd`, which zlib answers `Z_BUF_ERROR` for
   * a stream that has not ended.
   */
  isFinished(atEnd?: boolean): boolean;
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
 * Ruby stdlib's `Zlib::GzipWriter` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3841`), the
 * streaming counterpart of one-shot `Zlib.gzip` — `Rack::Deflater::GzipStream#each`
 * writes into it and reads the compressed bytes back through the io it wraps
 * (`vendor/rack/v3.2.8/lib/rack/deflater.rb:101`). Node's gzip stream is asynchronous,
 * so `finish` is awaited where Ruby's returns.
 *
 * @noRailsEquivalent PERMANENT — the platform seam under Ruby stdlib `Zlib`
 * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3841`); Rails calls `Zlib`, and neither Rails
 * nor Ruby declares the backend registry a JS runtime needs.
 */
export class GzipWriter {
  private readonly gz: InstanceType<typeof Zlib.GzipWriter>;

  /** @noRailsEquivalent PERMANENT */
  constructor(io: GzipWriterIO) {
    this.gz = new Zlib.GzipWriter(io as ConstructorParameters<typeof Zlib.GzipWriter>[0]);
  }

  /** @noRailsEquivalent PERMANENT */
  get mtime(): number | null {
    return this.gz.mtime;
  }

  /** @noRailsEquivalent PERMANENT */
  set mtime(value: number | null) {
    this.gz.mtime = value;
  }

  /** @noRailsEquivalent PERMANENT */
  write(data: Uint8Array): void {
    this.gz.write(data);
  }

  /** @noRailsEquivalent PERMANENT */
  async flush(flush = Z_SYNC_FLUSH): Promise<void> {
    await this.gz.flush(flush);
  }

  /** @noRailsEquivalent PERMANENT */
  async finish(): Promise<void> {
    this.gz.finish();
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

type NodeZlibHandle = {
  writeSync(
    flush: number,
    src: Uint8Array,
    inOff: number,
    inLen: number,
    out: Uint8Array,
    outOff: number,
    outLen: number,
  ): void;
};

type NodeZlibStream = {
  _handle: NodeZlibHandle | null;
  _writeState: Uint32Array;
  on(event: string, listener: (arg?: unknown) => void): void;
};

type NodeZlib = {
  gzipSync: (data: Uint8Array, options: { level: number; strategy: number }) => Uint8Array;
  gunzipSync: (data: Uint8Array) => Uint8Array;
  deflateSync: (data: Uint8Array) => Uint8Array;
  inflateSync: (data: Uint8Array, options?: { finishFlush: number }) => Uint8Array;
  createDeflateRaw: (options: { level: number; strategy: number }) => NodeZlibStream;
  createInflateRaw: () => NodeZlibStream;
  createDeflate: (options: { level: number; strategy: number }) => NodeZlibStream;
  createInflate: () => NodeZlibStream;
  createUnzip: () => NodeZlibStream;
};

const Z_FINISH = 4;

const ZSTREAM_AVAIL_OUT_STEP = 16384;

/**
 * `zstream_run` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:1190`) over the handle
 * under one of Node's zlib streams, driven as `processChunkSync` drives it but
 * left open between calls, which `_processChunk` is not.
 */
function nodeZStream(stream: NodeZlibStream, inflate: boolean): ZStream {
  let error: unknown = null;
  stream.on("error", (err) => {
    error ??= err;
  });
  let finished = false;
  const raised = (): unknown => {
    const kError = Object.getOwnPropertySymbols(stream).find((s) => s.description === "kError");
    return (kError && (stream as unknown as Record<symbol, unknown>)[kError]) ?? error;
  };
  const z: ZStream & { totalIn: number; totalOut: number } = {
    input: new Uint8Array(),
    totalIn: 0,
    totalOut: 0,
    run(src, flush) {
      const handle = stream._handle;
      if (handle === null) throw raised();
      let input = src;
      if (z.input.length > 0) {
        input = new Uint8Array(z.input.length + src.length);
        input.set(z.input);
        input.set(src, z.input.length);
      }
      const chunks: Uint8Array[] = [];
      let inOff = 0;
      let availIn = input.length;
      for (;;) {
        const out = new Uint8Array(ZSTREAM_AVAIL_OUT_STEP);
        handle.writeSync(flush, input, inOff, availIn, out, 0, out.length);
        if (stream._handle === null) throw raised();
        const [availOut, availInAfter] = stream._writeState;
        chunks.push(out.subarray(0, out.length - availOut));
        inOff += availIn - availInAfter;
        availIn = availInAfter;
        if (availOut !== 0) break;
      }
      z.input = input.slice(inOff);
      if (inflate && z.input.length > 0) finished = true;
      if (!inflate && flush === Z_FINISH) finished = true;
      z.totalIn += inOff;
      const dst = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        dst.set(chunk, offset);
        offset += chunk.length;
      }
      z.totalOut += dst.length;
      return dst;
    },
    isFinished(atEnd = false) {
      if (finished || !atEnd || !inflate) return finished;
      try {
        z.run(new Uint8Array(), Z_FINISH);
        finished = true;
      } catch {
        return false;
      }
      return finished;
    },
  };
  return z;
}

const Z_SYNC_FLUSH = 2;

function wrap(zlib: NodeZlib): ZlibAdapter {
  return {
    gzip: (data, level, strategy) => zlib.gzipSync(data, { level, strategy }),
    gunzip: (data) => zlib.gunzipSync(data),
    deflate: (data) => zlib.deflateSync(data),
    inflate: (data) => zlib.inflateSync(data),
    deflateZStream: (level, windowBits, strategy) =>
      nodeZStream(
        windowBits < 0
          ? zlib.createDeflateRaw({ level, strategy })
          : zlib.createDeflate({ level, strategy }),
        false,
      ),
    inflateZStream: (windowBits) =>
      nodeZStream(
        windowBits < 0
          ? zlib.createInflateRaw()
          : windowBits > 15
            ? zlib.createUnzip()
            : zlib.createInflate(),
        true,
      ),
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
