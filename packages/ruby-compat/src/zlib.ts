import { File } from "./file.js";
import type { Tempfile } from "./tempfile.js";
import type { StringIO } from "./string-io.js";
import { getZlib, type GzipReaderHandle, type GzipWriterHandle } from "./zlib-adapter.js";
import { b } from "./string/b.js";
import { StandardError } from "./standard-error.js";
import { registerConstant } from "./variable.js";

class ZError extends StandardError {}

/**
 * `Zlib::GzipFile` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4838`). `gzfile_s_open`
 * (`zlib.c:3233`) opens `filename` in the subclass' mode and hands the stream
 * to `gzfile_wrap` (`zlib.c:3178`), which closes it on the way out of a block.
 */
class GzipFile<IO extends { close(): void } = File> {
  /** `cGzError` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4828`). */
  static Error = class Error extends globalThis.Error {};

  /** `GZFILE_FLAG_HEADER_FINISHED` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2369`), set by `gzfile_make_header`. */
  protected headerFinished = false;

  /** `ZSTREAM_FLAG_READY` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:575`), cleared by `zstream_end`. */
  protected zstreamReady = true;

  constructor(protected io: IO) {}

  close(): Promise<void> | void {
    if (!this.zstreamReady) {
      return;
    }
    this.zstreamReady = false;
    this.io.close();
  }
}

/**
 * `Zlib::GzipReader` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4877`); `open` is
 * `gzfile_s_open(argc, argv, klass, "rb")` (`zlib.c:3871`).
 */
class GzipReader extends GzipFile<File | StringIO<Uint8Array>> {
  private readonly z: GzipReaderHandle;

  constructor(io: File | StringIO<Uint8Array>) {
    super(io);
    this.z = getZlib().gzipReader(io);
  }

  /**
   * `rb_gzfile_mtime` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3272`), as seconds
   * since the epoch, the number `GzipWriter#mtime` answers too.
   */
  get mtime(): number {
    return this.z.mtime;
  }

  static open(filename: string): GzipReader;
  static open<T>(filename: string, block: (gz: GzipReader) => T | Promise<T>): Promise<T>;
  static open<T>(
    filename: string,
    block?: (gz: GzipReader) => T | Promise<T>,
  ): Promise<T> | GzipReader {
    const io = File.open(filename, "rb");
    const gz = new GzipReader(io);
    if (!block) return gz;
    return gzfileWrap(gz, block);
  }

  /**
   * `rb_gzreader_read` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4009`) with no
   * length: the inflated bytes, one character per byte. `gzfile_newstr`
   * (`zlib.c:2859`) tags them with the default external encoding without
   * converting them, and a JS string carries no tag, so a text reader takes
   * them through `forceEncoding`.
   */
  async read(): Promise<string> {
    const bytes = await this.z.read();
    let str = "";
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return str;
  }
}

/**
 * `Zlib::GzipWriter` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4859`); `open` is
 * `gzfile_s_open(argc, argv, klass, "wb")` (`zlib.c:3661`).
 */
class GzipWriter extends GzipFile<File | Tempfile> {
  private readonly z: GzipWriterHandle;

  constructor(io: File | Tempfile) {
    super(io);
    this.z = getZlib().gzipWriter(io);
  }

  /**
   * `rb_gzfile_mtime` / `rb_gzfile_set_mtime`
   * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3356,3576`) — the MTIME field of the gzip
   * header, which `SchemaCache#open` zeroes so two dumps of the same cache are
   * byte-identical (`schema_cache.rb:468`).
   */
  get mtime(): number | null {
    return this.z.mtime;
  }

  set mtime(mtime: number | null) {
    if (this.headerFinished) {
      throw new GzipFile.Error("header is already written");
    }
    this.z.mtime = mtime;
  }

  static open(filename: string): GzipWriter;
  static open<T>(filename: string, block: (gz: GzipWriter) => T | Promise<T>): Promise<T>;
  static open<T>(
    filename: string,
    block?: (gz: GzipWriter) => T | Promise<T>,
  ): Promise<T> | GzipWriter {
    const io = File.open(filename, "wb");
    const gz = new GzipWriter(io);
    if (!block) return gz;
    return gzfileWrap(gz, block);
  }

  /**
   * `rb_gzwriter_write` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3745`). A
   * `Uint8Array` is an ASCII-8BIT String's bytes, as for `IO#write`.
   */
  write(string: string | Uint8Array): number {
    const buffer = typeof string === "string" ? new TextEncoder().encode(string) : string;
    this.headerFinished = true;
    this.z.write(buffer);
    return buffer.length;
  }

  /** `rb_gzwriter_flush` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3720`). */
  async flush(): Promise<this> {
    this.headerFinished = true;
    await this.z.flush();
    return this;
  }

  async close(): Promise<void> {
    if (!this.zstreamReady) {
      return;
    }
    await this.z.finish();
    await super.close();
  }
}

/**
 * `Zlib::Inflate` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4725`). Its one-shot
 * `inflate` (`rb_inflate_s_inflate`, `zlib.c:2044`) answers the inflated bytes
 * as a binary String, held as its bytes, raising `Zlib::Error` on a malformed
 * stream. An instance (`rb_inflate_initialize`, `zlib.c:1991`) inflates a
 * stream a chunk at a time, answering what each chunk completes. Node has no
 * synchronous streaming inflater, so each call re-inflates the accumulated
 * input to a `Z_SYNC_FLUSH` point and answers the new tail: quadratic in the
 * stream's length, and `finish` has nothing left to flush.
 */
class Inflate {
  private input = new Uint8Array();
  private produced = 0;

  constructor(private readonly windowBits = 15) {}

  static inflate(src: string): Uint8Array {
    try {
      return getZlib().inflate(Uint8Array.from(src, (c) => c.charCodeAt(0)));
    } catch (error) {
      throw new ZError((error as Error).message);
    }
  }

  /** `rb_inflate_inflate` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2145`). */
  inflate(string: string | Uint8Array): Uint8Array {
    const bytes =
      typeof string === "string" ? Uint8Array.from(string, (c) => c.charCodeAt(0)) : string;
    const src = new Uint8Array(this.input.length + bytes.length);
    src.set(this.input);
    src.set(bytes, this.input.length);
    this.input = src;
    let out: Uint8Array;
    try {
      out = getZlib().inflateStream(src, this.windowBits);
    } catch (error) {
      throw new ZError((error as Error).message);
    }
    const ret = out.slice(this.produced);
    this.produced = out.length;
    return ret;
  }

  /**
   * `rb_zstream_finish` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:1409`). Every
   * chunk was inflated to a sync point as it arrived, so nothing is left.
   */
  finish(): Uint8Array {
    return new Uint8Array();
  }
}

/** `gzfile_ensure_close` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3165-3175`). */
function gzfileEnsureClose(gz: GzipReader | GzipWriter): Promise<void> | void {
  if (gz["zstreamReady"]) {
    return gz.close();
  }
}

async function gzfileWrap<G extends GzipReader | GzipWriter, T>(
  gz: G,
  block: (gz: G) => T | Promise<T>,
): Promise<T> {
  try {
    return await block(gz);
  } finally {
    await gzfileEnsureClose(gz);
  }
}

/**
 * `Zlib` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4659`), the sliver of it trails calls.
 *
 * Rails reaches this module from more than one file — `Zlib.crc32(db_name_hash)`
 * for the advisory-lock id in
 * `vendor/rails/v8.0.2/activerecord/lib/active_record/migration.rb:1617`, and
 * `host % (Zlib.crc32(source) % 4)` in
 * `vendor/rails/v8.0.2/actionview/lib/action_view/helpers/asset_url_helper.rb:295`
 * (its `require "zlib"` at `asset_url_helper.rb:3`) — and Ruby has exactly one
 * `Zlib`, so trails has exactly one too.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib`
 * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4659`), which Rails calls without defining, so
 * no Rails or gem file declares the module this file's single export lives in.
 */
export const Zlib = {
  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:1004` — zlib.h's `Z_DEFAULT_COMPRESSION`, the
   * level `ActiveSupport::Gzip.compress` defaults to (`gzip.rb:32`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::DEFAULT_COMPRESSION`.
   */
  DEFAULT_COMPRESSION: -1,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:1035` — zlib.h's `Z_DEFAULT_STRATEGY`
   * (`gzip.rb:32`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::DEFAULT_STRATEGY`.
   */
  DEFAULT_STRATEGY: 0,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4827` `cGzipFile`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::GzipFile`.
   */
  GzipFile,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4877` `rb_cGzipReader`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::GzipReader`.
   */
  GzipReader,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4859` `rb_cGzipWriter`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::GzipWriter`.
   */
  GzipWriter,

  /**
   * `Zlib::Error` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4646` `cZError`), a `StandardError`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::Error`.
   */
  Error: ZError,

  /**
   * `Zlib::Deflate` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4713`), whose one-shot
   * `deflate` (`rb_deflate_s_deflate`, `zlib.c:1730`) compresses the String's
   * bytes (a text String's UTF-8 bytes) at `Z_DEFAULT_COMPRESSION` and answers them
   * as a binary String.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::Deflate`.
   */
  Deflate: {
    deflate(src: string | Uint8Array): Uint8Array {
      return b(getZlib().deflate(src instanceof Uint8Array ? src : new TextEncoder().encode(src)));
    },
  },

  /**
   * `Zlib::Inflate` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4725`), whose one-shot
   * `inflate` (`rb_inflate_s_inflate`, `zlib.c:2044`) answers the inflated bytes
   * as a binary String, held as its bytes, raising `Zlib::Error` on a malformed stream.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::Inflate`.
   */
  Inflate,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4783` — zlib.h's `MAX_WBITS`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::MAX_WBITS`.
   */
  MAX_WBITS: 15,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:507` `rb_zlib_crc32`, which is
   * `do_checksum(argc, argv, crc32)` (`zlib.c:410`): `crc` seeds `sum`, an
   * omitted `string` answers that seed unchanged (`zlib.c:428`), and otherwise
   * `sum` is folded over the String's BYTES (`zlib.c:441`) — so a multibyte
   * String is digested as its UTF-8 encoding.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib.crc32`
   * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:507`).
   */
  crc32(string = "", crc = 0): number {
    let sum = ~crc >>> 0;
    for (const byte of new TextEncoder().encode(string)) {
      sum ^= byte;
      for (let i = 0; i < 8; i++) {
        sum = (sum >>> 1) ^ (sum & 1 ? 0xedb88320 : 0);
      }
    }
    return (sum ^ 0xffffffff) >>> 0;
  },
};

registerConstant("Zlib::Error", ZError);
