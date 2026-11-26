import { constSet } from "./include.js";
import { TopLevel, rbObjRespondTo } from "./object.js";
import { File } from "./file.js";
import type { Tempfile } from "./tempfile.js";
import type { StringIO } from "./string-io.js";
import { getZlib, type ZStream } from "./zlib-adapter.js";
import { b } from "./string/b.js";
import { StandardError } from "./standard-error.js";
import { ArgumentError } from "./argument-error.js";

class ZError extends StandardError {}

/** `cGzError` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4828`). */
class GzError extends globalThis.Error {}

/** `cNoFooter` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4834`). */
class NoFooter extends GzError {}

/** `cCRCError` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4835`). */
class CRCError extends GzError {}

/** `cLengthError` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4836`). */
class LengthError extends GzError {}

/** `GZFILE_READ_SIZE` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2376`). */
const GZFILE_READ_SIZE = 2048;

/** `gzfile_get32` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2597`). */
function gzfileGet32(src: Uint8Array, offset = 0): number {
  return (
    (src[offset] | (src[offset + 1] << 8) | (src[offset + 2] << 16) | (src[offset + 3] << 24)) >>> 0
  );
}

/** `gzfile_set32` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2608`). */
function gzfileSet32(n: number, dst: Uint8Array, offset = 0): void {
  dst[offset] = n & 0xff;
  dst[offset + 1] = (n >>> 8) & 0xff;
  dst[offset + 2] = (n >>> 16) & 0xff;
  dst[offset + 3] = (n >>> 24) & 0xff;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  const dst = new Uint8Array(a.length + b.length);
  dst.set(a);
  dst.set(b, a.length);
  return dst;
}

/**
 * `Zlib::GzipFile` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4838`). `gzfile_s_open`
 * (`zlib.c:3233`) opens `filename` in the subclass' mode and hands the stream
 * to `gzfile_wrap` (`zlib.c:3178`), which closes it on the way out of a block.
 */
class GzipFile<IO extends { close(): void } = File> {
  static Error = GzError;
  static NoFooter = NoFooter;
  static CRCError = CRCError;
  static LengthError = LengthError;

  /** `GZFILE_FLAG_HEADER_FINISHED` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2369`), set by `gzfile_make_header`. */
  protected headerFinished = false;

  /** `GZFILE_FLAG_FOOTER_FINISHED` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2370`). */
  protected footerFinished = false;

  /** `ZSTREAM_FLAG_READY` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:575`), cleared by `zstream_end`. */
  protected zstreamReady = true;

  /** `GZFILE_FLAG_SYNC` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2368`). */
  protected syncFlag = false;

  /** `gz->crc` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2355`). */
  protected crc = 0;

  /** `gz->z.buf` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:568`). */
  protected buf: Uint8Array = new Uint8Array();

  constructor(
    protected io: IO,
    protected z: ZStream,
  ) {}

  /** `rb_gzfile_sync` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3514`). */
  get sync(): boolean {
    return this.syncFlag;
  }

  /** `rb_gzfile_set_sync` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3529`). */
  set sync(mode: boolean) {
    this.syncFlag = mode;
  }

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
  private readonly _mtime: number;

  /** `rb_gzreader_initialize` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3944`). */
  constructor(io: File | StringIO<Uint8Array>) {
    super(io, getZlib().inflateZStream(-Zlib.MAX_WBITS));
    this._mtime = this.gzfileReadHeader();
  }

  /**
   * `rb_gzfile_mtime` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3272`), as seconds
   * since the epoch, the number `GzipWriter#mtime` answers too.
   */
  get mtime(): number {
    return this._mtime;
  }

  /** `rb_gzfile_s_wrap` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3222`). */
  static wrap<T>(
    io: File | StringIO<Uint8Array>,
    block: (gz: GzipReader) => T | Promise<T>,
  ): Promise<T> {
    return gzfileWrap(new GzipReader(io), block);
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
   * `rb_gzreader_read` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4009`): with no
   * length `gzfile_read_all` (`zlib.c:2946`), otherwise `gzfile_read`
   * (`zlib.c:2894`), which answers `nil` at the end of the stream. The bytes
   * are one character per byte; `gzfile_newstr` (`zlib.c:2859`) tags them
   * with the default external encoding without converting them, and a JS
   * string carries no tag, so a text reader takes them through `forceEncoding`.
   */
  read(len?: null): string;
  read(len: number): string | null;
  read(len: number | null = null): string | null {
    if (len == null) {
      return this.gzfileReadAll();
    }
    if (len < 0) {
      throw new ArgumentError(`negative length ${len} given`);
    }
    return this.gzfileRead(len);
  }

  /** `rb_gzfile_close` over `gzfile_reader_end` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3048-3068`). */
  close(): void {
    if (!this.zstreamReady) {
      return;
    }
    this.zstreamReady = false;
    try {
      if (this.isGzfileFinished() && !this.footerFinished) {
        this.gzfileCheckFooter();
      }
    } finally {
      this.io.close();
    }
  }

  /** `GZFILE_IS_FINISHED` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2373`). */
  private isGzfileFinished(): boolean {
    return this.z.isFinished() && this.buf.length === 0;
  }

  /** `gzfile_read_raw` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2537`). */
  private gzfileReadRaw(): Uint8Array | null {
    const str = this.io.read(GZFILE_READ_SIZE);
    if (str == null) return null;
    return typeof str === "string"
      ? Uint8Array.from(str, (c: string) => c.charCodeAt(0) & 0xff)
      : str;
  }

  /** `gzfile_read_raw_ensure` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2551`). */
  private gzfileReadRawEnsure(size: number): boolean {
    while (this.z.input.length < size) {
      const str = this.gzfileReadRaw();
      if (str == null || str.length === 0) return false;
      this.z.input = concatBytes(this.z.input, str);
    }
    return true;
  }

  /**
   * `gzfile_read_header` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2702`), answering
   * the MTIME field. Only the fixed ten-byte header is read: no trails writer
   * sets the EXTRA, ORIG_NAME or COMMENT fields.
   */
  private gzfileReadHeader(): number {
    if (!this.gzfileReadRawEnsure(10)) {
      throw new GzError("not in gzip format");
    }
    const head = this.z.input;
    if (head[0] !== 0x1f || head[1] !== 0x8b) {
      throw new GzError("not in gzip format");
    }
    if (head[2] !== 8) {
      throw new GzError(`unsupported compression method ${head[2]}`);
    }
    const mtime = gzfileGet32(head, 4);
    this.z.input = head.slice(10);
    if (this.z.input.length > 0) {
      this.buf = concatBytes(this.buf, this.z.run(new Uint8Array(), Zlib.SYNC_FLUSH));
    }
    return mtime;
  }

  /** `gzfile_check_footer` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2780`). */
  private gzfileCheckFooter(): void {
    this.footerFinished = true;
    if (!this.gzfileReadRawEnsure(8)) {
      throw new NoFooter("footer is not found");
    }
    const crc = gzfileGet32(this.z.input);
    const length = gzfileGet32(this.z.input, 4);
    this.z.input = this.z.input.slice(8);
    if (this.crc !== crc) {
      throw new CRCError("invalid compressed data -- crc error");
    }
    if (this.z.totalOut >>> 0 !== length) {
      throw new LengthError("invalid compressed data -- length error");
    }
  }

  /** `gzfile_read_more` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2823`). */
  private gzfileReadMore(): number {
    while (!this.z.isFinished()) {
      const str = this.gzfileReadRaw();
      if (str == null) {
        if (!this.z.isFinished(true)) {
          throw new GzError("unexpected end of file");
        }
        break;
      }
      if (str.length > 0) {
        this.buf = concatBytes(this.buf, this.z.run(str, Zlib.SYNC_FLUSH));
      }
      if (this.buf.length > 0) break;
    }
    return this.buf.length;
  }

  /** `gzfile_calc_crc` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2846`). */
  private gzfileCalcCrc(str: Uint8Array): void {
    this.crc = Zlib.crc32(str, this.crc);
  }

  /** `gzfile_fill` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2875`). */
  private gzfileFill(len: number): number {
    if (len === 0) return 0;
    while (!this.z.isFinished() && this.buf.length < len) {
      this.gzfileReadMore();
    }
    if (this.isGzfileFinished()) {
      if (!this.footerFinished) {
        this.gzfileCheckFooter();
      }
      return -1;
    }
    return len < this.buf.length ? len : this.buf.length;
  }

  /** `gzfile_read` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2894`). */
  private gzfileRead(len: number): string | null {
    len = this.gzfileFill(len);
    if (len === 0) return "";
    if (len < 0) return null;
    const dst = this.zstreamShiftBuffer(len);
    this.gzfileCalcCrc(dst);
    return bytesToString(dst);
  }

  /** `gzfile_read_all` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2946`). */
  private gzfileReadAll(): string {
    while (!this.z.isFinished()) {
      this.gzfileReadMore();
    }
    if (this.isGzfileFinished()) {
      if (!this.footerFinished) {
        this.gzfileCheckFooter();
      }
      return "";
    }
    const dst = this.zstreamShiftBuffer(this.buf.length);
    this.gzfileCalcCrc(dst);
    return bytesToString(dst);
  }

  /** `zstream_shift_buffer` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:823`). */
  private zstreamShiftBuffer(len: number): Uint8Array {
    const dst = this.buf.subarray(0, len);
    this.buf = this.buf.subarray(len);
    return dst;
  }
}

function bytesToString(bytes: Uint8Array): string {
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return str;
}

/**
 * `Zlib::GzipWriter` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4859`); `open` is
 * `gzfile_s_open(argc, argv, klass, "wb")` (`zlib.c:3661`).
 */
class GzipWriter extends GzipFile<File | Tempfile | StringIO<Uint8Array>> {
  /** `gz->mtime`, `nil` until `mtime=` sets `GZFILE_FLAG_MTIME_IS_SET` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2353`). */
  private _mtime: number | null = null;

  /** `gz->level` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2351`). */
  private readonly level: number;

  /** `rb_gzwriter_initialize` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3680`). */
  constructor(
    io: File | Tempfile | StringIO<Uint8Array>,
    level: number | null = null,
    strategy: number | null = null,
  ) {
    const lvl = level ?? Zlib.DEFAULT_COMPRESSION;
    super(io, getZlib().deflateZStream(lvl, -Zlib.MAX_WBITS, strategy ?? Zlib.DEFAULT_STRATEGY));
    this.level = lvl;
  }

  /**
   * `rb_gzfile_mtime` / `rb_gzfile_set_mtime`
   * (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3356,3576`) — the MTIME field of the gzip
   * header, which `SchemaCache#open` zeroes so two dumps of the same cache are
   * byte-identical (`schema_cache.rb:468`).
   */
  get mtime(): number | null {
    return this._mtime;
  }

  set mtime(mtime: number | null) {
    if (this.headerFinished) {
      throw new GzipFile.Error("header is already written");
    }
    this._mtime = mtime;
  }

  /** `rb_gzfile_s_wrap` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3222`). */
  static wrap<T>(
    io: File | Tempfile | StringIO<Uint8Array>,
    block: (gz: GzipWriter) => T | Promise<T>,
  ): Promise<T> {
    return gzfileWrap(new GzipWriter(io), block);
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
    const str = typeof string === "string" ? new TextEncoder().encode(string) : string;
    this.gzfileWrite(str);
    return str.length;
  }

  /** `rb_gzwriter_flush` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3721`). */
  async flush(flush: number = Zlib.SYNC_FLUSH): Promise<this> {
    if (flush !== Zlib.NO_FLUSH) {
      this.zstreamRun(new Uint8Array(), flush);
    }
    this.gzfileWriteRaw();
    if (rbObjRespondTo(this.io, "flush")) {
      this.io.flush();
    }
    return this;
  }

  /** `rb_gzfile_finish` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3468`): ends the stream and answers the io, unclosed. */
  finish(): File | Tempfile | StringIO<Uint8Array> {
    this.gzfileWriterEnd();
    return this.io;
  }

  async close(): Promise<void> {
    if (!this.zstreamReady) {
      return;
    }
    this.gzfileWriterEnd();
    await super.close();
  }

  /** `gzfile_writer_end` / `gzfile_writer_end_run` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:3023-3045`). */
  private gzfileWriterEnd(): void {
    if (this.footerFinished) return;
    if (!this.headerFinished) {
      this.gzfileMakeHeader();
    }
    this.zstreamRun(new Uint8Array(), Zlib.FINISH);
    this.gzfileMakeFooter();
    this.gzfileWriteRaw();
  }

  /** `zstream_run` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:1190`), appending to `z.buf`. */
  private zstreamRun(src: Uint8Array, flush: number): void {
    this.buf = concatBytes(this.buf, this.z.run(src, flush));
  }

  /** `gzfile_make_header` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2647`). */
  private gzfileMakeHeader(): void {
    let extraflags = 0;
    if (this._mtime == null) {
      this._mtime = Math.floor(Date.now() / 1000);
    }
    if (this.level === 1) {
      extraflags |= 0x4;
    } else if (this.level === 9) {
      extraflags |= 0x2;
    }
    const buf = new Uint8Array(10);
    buf[0] = 0x1f;
    buf[1] = 0x8b;
    buf[2] = 8;
    buf[3] = 0;
    gzfileSet32(this._mtime, buf, 4);
    buf[8] = extraflags;
    buf[9] = OS_CODE;
    this.buf = concatBytes(this.buf, buf);
    this.headerFinished = true;
  }

  /** `gzfile_make_footer` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2691`). */
  private gzfileMakeFooter(): void {
    const buf = new Uint8Array(8);
    gzfileSet32(this.crc, buf);
    gzfileSet32(this.z.totalIn, buf, 4);
    this.buf = concatBytes(this.buf, buf);
    this.footerFinished = true;
  }

  /** `gzfile_write` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2808`). */
  private gzfileWrite(str: Uint8Array): void {
    if (!this.headerFinished) {
      this.gzfileMakeHeader();
    }
    if (str.length > 0 || this.syncFlag) {
      this.crc = Zlib.crc32(str, this.crc);
      this.zstreamRun(str, this.syncFlag ? Zlib.SYNC_FLUSH : Zlib.NO_FLUSH);
    }
    this.gzfileWriteRaw();
  }

  /** `gzfile_write_raw` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2496`). */
  private gzfileWriteRaw(): void {
    if (this.buf.length > 0) {
      const str = this.buf;
      this.buf = new Uint8Array();
      this.io.write(str);
      if (this.syncFlag && rbObjRespondTo(this.io, "flush")) {
        this.io.flush();
      }
    }
  }
}

/** `OS_CODE` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2337`), `OS_UNIX`, the code zlib's own gzip writer and Node's put in the header. */
const OS_CODE = 0x03;

/**
 * `Zlib::Inflate` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:4725`). Its one-shot
 * `inflate` (`rb_inflate_s_inflate`, `zlib.c:2044`) answers the inflated bytes
 * as a binary String, held as its bytes, raising `Zlib::Error` on a malformed
 * stream. An instance (`rb_inflate_initialize`, `zlib.c:1991`) inflates a
 * stream a chunk at a time, answering what each chunk completes.
 */
class Inflate {
  private readonly z: ZStream;

  constructor(windowBits = 15) {
    this.z = getZlib().inflateZStream(windowBits);
  }

  static inflate(src: string | Uint8Array): Uint8Array {
    try {
      return getZlib().inflate(
        typeof src === "string" ? Uint8Array.from(src, (c) => c.charCodeAt(0)) : src,
      );
    } catch (error) {
      throw new ZError((error as Error).message);
    }
  }

  /** `rb_inflate_inflate` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:2145`). */
  inflate(string: string | Uint8Array): Uint8Array {
    const bytes =
      typeof string === "string" ? Uint8Array.from(string, (c) => c.charCodeAt(0)) : string;
    try {
      return this.z.run(bytes, Zlib.SYNC_FLUSH);
    } catch (error) {
      throw new ZError((error as Error).message);
    }
  }

  /** `rb_zstream_total_in` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:1505`). */
  totalIn(): number {
    return this.z.totalIn;
  }

  /** `rb_zstream_total_out` (`vendor/ruby/v3.3.11/ext/zlib/zlib.c:1514`). */
  totalOut(): number {
    return this.z.totalOut;
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
 * `vendor/rails/v8.0.5.2/activerecord/lib/active_record/migration.rb:1617`, and
 * `host % (Zlib.crc32(source) % 4)` in
 * `vendor/rails/v8.0.5.2/actionview/lib/action_view/helpers/asset_url_helper.rb:295`
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
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4797` — zlib.h's `Z_NO_FLUSH`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::NO_FLUSH`.
   */
  NO_FLUSH: 0,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4804` — zlib.h's `Z_SYNC_FLUSH`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::SYNC_FLUSH`.
   */
  SYNC_FLUSH: 2,

  /**
   * `vendor/ruby/v3.3.11/ext/zlib/zlib.c:4815` — zlib.h's `Z_FINISH`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Zlib::FINISH`.
   */
  FINISH: 4,

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
  crc32(string: string | Uint8Array = "", crc = 0): number {
    let sum = ~crc >>> 0;
    for (const byte of typeof string === "string" ? new TextEncoder().encode(string) : string) {
      sum ^= byte;
      for (let i = 0; i < 8; i++) {
        sum = (sum >>> 1) ^ (sum & 1 ? 0xedb88320 : 0);
      }
    }
    return (sum ^ 0xffffffff) >>> 0;
  },
};

constSet(TopLevel, "Zlib", Zlib);
constSet(Zlib, "Error", ZError);
