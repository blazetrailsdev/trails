import { File } from "./file.js";
import { getZlib } from "./zlib-adapter.js";

/**
 * `Zlib::GzipFile` (`vendor/ruby/ext/zlib/zlib.c:4838`). `gzfile_s_open`
 * (`zlib.c:3233`) opens `filename` in the subclass' mode and hands the stream
 * to `gzfile_wrap` (`zlib.c:3178`), which closes it on the way out of a block.
 */
class GzipFile {
  constructor(protected io: File) {}

  close(): void {
    this.io.close();
  }
}

/**
 * `Zlib::GzipReader` (`vendor/ruby/ext/zlib/zlib.c:4877`); `open` is
 * `gzfile_s_open(argc, argv, klass, "rb")` (`zlib.c:3871`).
 */
class GzipReader extends GzipFile {
  static open(filename: string): GzipReader;
  static open<T>(filename: string, block: (gz: GzipReader) => T): T;
  static open<T>(filename: string, block?: (gz: GzipReader) => T): T | GzipReader {
    const io = File.open(filename, "rb");
    const gz = new GzipReader(io);
    if (!block) return gz;
    try {
      return block(gz);
    } finally {
      gz.close();
    }
  }

  read(): string {
    const raw = this.io.read();
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    return new TextDecoder().decode(getZlib().gunzip(bytes));
  }
}

/**
 * `Zlib::GzipWriter` (`vendor/ruby/ext/zlib/zlib.c:4859`); `open` is
 * `gzfile_s_open(argc, argv, klass, "wb")` (`zlib.c:3661`). The `ZlibAdapter`
 * seam is one-shot rather than streaming, so the deflate stream is finished
 * into the associated IO at `close` (`rb_gzfile_close`, `zlib.c:3524`).
 */
class GzipWriter extends GzipFile {
  private buffer = "";

  static open(filename: string): GzipWriter;
  static open<T>(filename: string, block: (gz: GzipWriter) => T): T;
  static open<T>(filename: string, block?: (gz: GzipWriter) => T): T | GzipWriter {
    const io = File.open(filename, "wb");
    const gz = new GzipWriter(io);
    if (!block) return gz;
    try {
      return block(gz);
    } finally {
      gz.close();
    }
  }

  write(string: string): number {
    this.buffer += string;
    return new TextEncoder().encode(string).length;
  }

  close(): void {
    const bytes = new TextEncoder().encode(this.buffer);
    const gzipped = getZlib().gzip(bytes, Zlib.DEFAULT_COMPRESSION, Zlib.DEFAULT_STRATEGY);
    let out = "";
    for (const byte of gzipped) out += String.fromCharCode(byte);
    this.io.write(out);
    super.close();
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
