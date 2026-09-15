import { File } from "./file.js";
import type { Tempfile } from "./tempfile.js";
import { getZlib, type GzipWriterHandle } from "./zlib-adapter.js";

/**
 * `Zlib::GzipFile` (`vendor/ruby/ext/zlib/zlib.c:4838`). `gzfile_s_open`
 * (`zlib.c:3233`) opens `filename` in the subclass' mode and hands the stream
 * to `gzfile_wrap` (`zlib.c:3178`), which closes it on the way out of a block.
 */
class GzipFile<IO extends { close(): void } = File> {
  /** `ZSTREAM_FLAG_READY` (`vendor/ruby/ext/zlib/zlib.c:575`), cleared by `zstream_end`. */
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
 * `Zlib::GzipReader` (`vendor/ruby/ext/zlib/zlib.c:4877`); `open` is
 * `gzfile_s_open(argc, argv, klass, "rb")` (`zlib.c:3871`).
 */
class GzipReader extends GzipFile<File> {
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

  async read(): Promise<string> {
    return new TextDecoder().decode(await getZlib().gzipReader(this.io).read());
  }
}

/**
 * `Zlib::GzipWriter` (`vendor/ruby/ext/zlib/zlib.c:4859`); `open` is
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
   * (`vendor/ruby/ext/zlib/zlib.c:3356,3576`) — the MTIME field of the gzip
   * header, which `SchemaCache#open` zeroes so two dumps of the same cache are
   * byte-identical (`schema_cache.rb:468`).
   */
  get mtime(): number | null {
    return this.z.mtime;
  }

  set mtime(mtime: number | null) {
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

  write(string: string): number {
    this.z.write(new TextEncoder().encode(string));
    return new TextEncoder().encode(string).length;
  }

  /** `rb_gzwriter_flush` (`vendor/ruby/ext/zlib/zlib.c:3720`). */
  flush(): this {
    this.z.flush();
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

/** `gzfile_ensure_close` (`vendor/ruby/ext/zlib/zlib.c:3165-3175`). */
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
 * `Zlib` (`vendor/ruby/ext/zlib/zlib.c:4659`), the sliver of it trails calls.
 *
 * Rails reaches this module from more than one file — `Zlib.crc32(db_name_hash)`
 * for the advisory-lock id in
 * `vendor/rails/activerecord/lib/active_record/migration.rb:1617`, and
 * `host % (Zlib.crc32(source) % 4)` in
 * `vendor/rails/actionview/lib/action_view/helpers/asset_url_helper.rb:295`
 * (its `require "zlib"` at `asset_url_helper.rb:3`) — and Ruby has exactly one
 * `Zlib`, so trails has exactly one too.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib`
 * (`vendor/ruby/ext/zlib/zlib.c:4659`), which Rails calls without defining, so
 * no Rails or gem file declares the module this file's single export lives in.
 */
export const Zlib = {
  /**
   * `vendor/ruby/ext/zlib/zlib.c:1004` — zlib.h's `Z_DEFAULT_COMPRESSION`, the
   * level `ActiveSupport::Gzip.compress` defaults to (`gzip.rb:32`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::DEFAULT_COMPRESSION`.
   */
  DEFAULT_COMPRESSION: -1,

  /**
   * `vendor/ruby/ext/zlib/zlib.c:1035` — zlib.h's `Z_DEFAULT_STRATEGY`
   * (`gzip.rb:32`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::DEFAULT_STRATEGY`.
   */
  DEFAULT_STRATEGY: 0,

  /**
   * `vendor/ruby/ext/zlib/zlib.c:4877` `rb_cGzipReader`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::GzipReader`.
   */
  GzipReader,

  /**
   * `vendor/ruby/ext/zlib/zlib.c:4859` `rb_cGzipWriter`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::GzipWriter`.
   */
  GzipWriter,

  /**
   * `vendor/ruby/ext/zlib/zlib.c:507` `rb_zlib_crc32`, which is
   * `do_checksum(argc, argv, crc32)` (`zlib.c:410`): `crc` seeds `sum`, an
   * omitted `string` answers that seed unchanged (`zlib.c:428`), and otherwise
   * `sum` is folded over the String's BYTES (`zlib.c:441`) — so a multibyte
   * String is digested as its UTF-8 encoding.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib.crc32`
   * (`vendor/ruby/ext/zlib/zlib.c:507`).
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
