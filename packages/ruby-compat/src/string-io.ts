import { Encoding } from "./encoding.js";
import { EOFError } from "./eof-error.js";
import { IOError } from "./io-error.js";
import { print as ioPrint, puts as ioPuts } from "./io.js";
import { b } from "./string/b.js";
import { strNew } from "./string/bytes.js";

/**
 * Ruby's `StringIO` (stdlib), the readable/writable in-memory IO that
 * `XmlMini._parse_file` (`activesupport/lib/active_support/xml_mini.rb:180-186`)
 * and `Rack::MockRequest` hand to their callers. Only the members Ruby code in
 * this repo sends are ported.
 *
 * The buffer holds bytes, so `size`, `read`'s length and `write`'s return
 * value count bytes exactly as Ruby's do. A StringIO opened on an ASCII-8BIT
 * String, a `Uint8Array`, answers its whole-buffer reads as one, and every
 * other answers them as the UTF-8 text the bytes spell; `read`'s length arm
 * answers a `Uint8Array` whatever the buffer, as `strio_read`
 * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1539`) tags it ASCII-8BIT.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `StringIO`
 * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1432`) ships with the interpreter, so
 * no Rails file defines it and no port can remove the need for it while
 * `_parse_file` and `Rack::MockRequest` hand callers an IO.
 */
export class StringIO<S extends string | Uint8Array = string> {
  private _string: Uint8Array;
  private _binary: boolean;
  private _pos = 0;
  private _readable = true;
  private _writable = true;
  /** `ptr->enc` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1823`). */
  private enc: Encoding | null = null;

  constructor(string: S = "" as S) {
    this._string = new Uint8Array(0);
    this._binary = string instanceof Uint8Array;
    this.write(string);
    this._pos = 0;
  }

  string(): S {
    const bytes = this._string.slice();
    return (this._binary ? bytes : strNew(Array.from(bytes))) as S;
  }

  size(): number {
    return this._string.length;
  }

  /**
   * `strio_read` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1539`). The `str` buffer
   * of its two-argument form (`stringio.c:1548-1552`) receives the bytes, and
   * at EOF Ruby empties it with `rb_str_resize(str, 0)` (`stringio.c:1561`)
   * before answering `nil`.
   *
   * A `Uint8Array` cannot be resized, so — exactly as {@link IO.read} already
   * does for `io_read`'s identical `str` argument (`vendor/ruby/v3.3.11/io.c:3800`) —
   * it is filled up to its own length instead, and zero-filled where Ruby
   * truncates. That deviation is recorded once there; this is the same fact
   * about the same buffer.
   */
  read(): S;
  read(length: number, str?: Uint8Array | null): Uint8Array | null;
  read(length?: number, str?: Uint8Array | null): S | Uint8Array | null {
    if (length == null) {
      const rest = this._string.slice(this._pos);
      this._pos = this._string.length;
      return (this._binary ? rest : strNew(Array.from(rest))) as S;
    }
    if (this.isEof()) {
      if (str) str.fill(0);
      return length === 0 ? new Uint8Array(0) : null;
    }
    const chunk = this._string.slice(this._pos, this._pos + length);
    this._pos += chunk.length;
    if (str) str.set(chunk.subarray(0, str.length));
    return chunk;
  }

  write(string: string | Uint8Array): number {
    const bytes = typeof string === "string" ? b(string) : string;
    const end = this._pos + bytes.length;
    if (end > this._string.length) {
      const grown = new Uint8Array(end);
      grown.set(this._string);
      this._string = grown;
    }
    this._string.set(bytes, this._pos);
    this._pos = end;
    return bytes.length;
  }

  /**
   * `IO::generic_writable#<<` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1955`
   * `strio_addstr`, which is `rb_io_addstr`, `vendor/ruby/v3.3.11/io.c:2323-2327`).
   *
   * @noRailsEquivalent PERMANENT
   */
  append(str: string | Uint8Array): this {
    this.write(str);
    return this;
  }

  /**
   * `IO::generic_writable#puts` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1530`
   * aliases it to `rb_io_puts`, `vendor/ruby/v3.3.11/io.c:8947`), which is how
   * `Rack::Session::Abstract::Persisted#commit_session` writes to
   * `rack.errors`. One body, shared with `IO#puts` — see `./io.js`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `IO::generic_writable#puts` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1530`).
   */
  puts = ioPuts;

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `IO::generic_writable#print` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1956`
   * aliases it to `rb_io_print`, `vendor/ruby/v3.3.11/io.c:8715`).
   */
  print = ioPrint;

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `strio_flush`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1891`) returns the StringIO itself,
   * which is how `Rack::ShowExceptions#call` flushes `rack.errors`.
   */
  flush(): this {
    return this;
  }

  /**
   * `strio_get_pos` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:940`), the offset
   * {@link rewind} puts back to zero.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#pos`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:940`).
   */
  get pos(): number {
    return this._pos;
  }

  rewind(): number {
    this._pos = 0;
    return 0;
  }

  /**
   * `strio_binmode` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1863`) — it records
   * ASCII-8BIT on the stream and, when the StringIO is writable, associates it
   * with the buffer String, then answers the StringIO, whose whole-buffer reads
   * then answer a `Uint8Array` (see the class comment).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#binmode`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1879`).
   */
  binmode(): this {
    this.enc = Encoding.ASCII_8BIT;
    this._binary = true;
    return this;
  }

  /**
   * `strio_set_encoding` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1801`) in its
   * one-argument form — the encoding is recorded on the stream and, when the
   * StringIO is writable, associated with the buffer String
   * (`stringio.c:1823-1826`); it answers the StringIO. `int_enc` and `opt` are
   * ignored by MRI itself (`stringio.c:1796-1797`), so neither is ported.
   *
   * Associated with `BINARY`, the buffer's whole-buffer reads answer a
   * `Uint8Array` (see the class comment), and the recorded encoding is what
   * `Rack::Test::Utils.build_file_part`'s `set_encoding(Encoding::BINARY)`
   * (`vendor/rack-test/v2.2.0/lib/rack/test/utils.rb:148`) is asking for.
   *
   * `rb_find_encoding` (`vendor/ruby/v3.3.11/encoding.c:325-332`) answers a NULL
   * `rb_encoding *` for a name that resolves to `UNSPECIFIED_ENCODING` — the
   * `internal` alias while `Encoding.default_internal` is unset — and
   * `strio_set_encoding` then falls through the mode-string path to no
   * encoding at all, which the stream reports as `ASCII-8BIT` (verified
   * against ruby 3.3: `StringIO.new("x").set_encoding("internal")
   * .external_encoding` is `#<Encoding:ASCII-8BIT>`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#set_encoding`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1801`).
   */
  setEncoding(extEnc: Encoding | string): this {
    this.enc = Encoding.find(extEnc) ?? Encoding.BINARY;
    this._binary = this.enc === Encoding.BINARY;
    return this;
  }

  /**
   * `strio_sysread` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1664`), which
   * `StringIO#readpartial` is defined as (`stringio.c:1949`): `read` with a
   * `rb_eof_error()` (`vendor/ruby/v3.3.11/io.c:756`) where that answers `nil` — the
   * member
   * `Rack::Test::UploadedFile#append_to`
   * (`vendor/rack-test/v2.2.0/lib/rack/test/uploaded_file.rb:64`) walks a StringIO
   * body with.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#readpartial`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1949`).
   */
  readpartial(maxlen: number, outbuf?: Uint8Array | null): Uint8Array {
    const ret = this.read(maxlen, outbuf);
    if (ret === null) throw new EOFError("end of file reached");
    return ret;
  }

  /**
   * `strio_gets` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1322`) with no
   * separator argument: the next line, newline included, or `nil` at EOF.
   *
   * @noRailsEquivalent PERMANENT
   */
  gets(): S | null {
    if (this.isEof()) return null;
    const newline = this._string.indexOf(0x0a, this._pos);
    const end = newline === -1 ? this._string.length : newline + 1;
    const bytes = this._string.slice(this._pos, end);
    this._pos = end;
    return (this._binary ? bytes : strNew(Array.from(bytes))) as S;
  }

  /**
   * `strio_each` (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:1366`) with no
   * separator argument: yields each remaining line and leaves the stream at EOF.
   *
   * @noRailsEquivalent PERMANENT
   */
  each(block: (line: S) => void): this {
    while (!this.isEof()) block(this.gets()!);
    return this;
  }

  isEof(): boolean {
    return this._pos >= this._string.length;
  }

  close(): void {
    this._readable = false;
    this._writable = false;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#close_read`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:520`).
   */
  closeRead(): null {
    if (!this._readable) throw new IOError("closing non-duplex IO for reading");
    this._readable = false;
    return null;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#close_write`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:541`).
   */
  closeWrite(): null {
    if (!this._writable) throw new IOError("closing non-duplex IO for writing");
    this._writable = false;
    return null;
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#closed?`
   * (`vendor/ruby/v3.3.11/ext/stringio/stringio.c:559`).
   */
  isClosed(): boolean {
    return !this._readable && !this._writable;
  }
}
