import { Encoding } from "./encoding.js";
import { EOFError } from "./eof-error.js";
import { puts as ioPuts } from "./io.js";

/**
 * Ruby's `StringIO` (stdlib), the readable/writable in-memory IO that
 * `XmlMini._parse_file` (`activesupport/lib/active_support/xml_mini.rb:180-186`)
 * and `Rack::MockRequest` hand to their callers. Only the members Ruby code in
 * this repo sends are ported.
 *
 * The buffer is a Ruby binary String — one character per byte — which is what
 * `Base64.decode64` returns (`xml_mini.rb:180-181`) and what a request body
 * already is, so `size`, `read`'s length and `write`'s return value count bytes
 * exactly as Ruby's do. A caller holding text encodes it before writing, as
 * Ruby does.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `StringIO`
 * (`vendor/ruby/ext/stringio/stringio.c:1432`) ships with the interpreter, so
 * no Rails file defines it and no port can remove the need for it while
 * `_parse_file` and `Rack::MockRequest` hand callers an IO.
 */
export class StringIO {
  private _string: string;
  private _pos = 0;
  private _closed = false;
  /** `ptr->enc` (`vendor/ruby/ext/stringio/stringio.c:1823`). */
  private enc: Encoding | null = null;

  constructor(string = "") {
    this._string = string;
  }

  string(): string {
    return this._string;
  }

  get size(): number {
    return this._string.length;
  }

  /**
   * `strio_read` (`vendor/ruby/ext/stringio/stringio.c:1539`). The `str` buffer
   * of its two-argument form (`stringio.c:1548-1552`) receives the bytes, and
   * at EOF Ruby empties it with `rb_str_resize(str, 0)` (`stringio.c:1561`)
   * before answering `nil`.
   *
   * A `Uint8Array` cannot be resized, so — exactly as {@link IO.read} already
   * does for `io_read`'s identical `str` argument (`vendor/ruby/io.c:3800`) —
   * it is filled up to its own length instead, and zero-filled where Ruby
   * truncates. That deviation is recorded once there; this is the same fact
   * about the same buffer.
   */
  read(): string;
  read(length: number, str?: Uint8Array | null): string | null;
  read(length?: number, str?: Uint8Array | null): string | null {
    if (length == null) {
      const rest = this._string.slice(this._pos);
      this._pos = this._string.length;
      return rest;
    }
    if (this.isEof()) {
      if (str) str.fill(0);
      return length === 0 ? "" : null;
    }
    const chunk = this._string.slice(this._pos, this._pos + length);
    this._pos += chunk.length;
    if (str)
      for (let i = 0; i < Math.min(chunk.length, str.length); i++) str[i] = chunk.charCodeAt(i);
    return chunk;
  }

  write(string: string): number {
    this._string =
      this._string.slice(0, this._pos) + string + this._string.slice(this._pos + string.length);
    this._pos += string.length;
    return string.length;
  }

  /**
   * `IO::generic_writable#puts` (`vendor/ruby/ext/stringio/stringio.c:1530`
   * aliases it to `rb_io_puts`, `vendor/ruby/io.c:8947`), which is how
   * `Rack::Session::Abstract::Persisted#commit_session` writes to
   * `rack.errors`. One body, shared with `IO#puts` — see `./io.js`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails:
   * `IO::generic_writable#puts` (`vendor/ruby/ext/stringio/stringio.c:1530`).
   */
  puts = ioPuts;

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `strio_flush`
   * (`vendor/ruby/ext/stringio/stringio.c:1891`) returns the StringIO itself,
   * which is how `Rack::ShowExceptions#call` flushes `rack.errors`.
   */
  flush(): this {
    return this;
  }

  /**
   * `strio_get_pos` (`vendor/ruby/ext/stringio/stringio.c:940`), the offset
   * {@link rewind} puts back to zero.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#pos`
   * (`vendor/ruby/ext/stringio/stringio.c:940`).
   */
  get pos(): number {
    return this._pos;
  }

  rewind(): number {
    this._pos = 0;
    return 0;
  }

  /**
   * `strio_binmode` (`vendor/ruby/ext/stringio/stringio.c:1863`) — it records
   * ASCII-8BIT on the stream and, when the StringIO is writable, associates it
   * with the buffer String, then answers the StringIO. The buffer already IS a
   * Ruby binary String (see the class comment), so the association is the
   * identity here, exactly as it is in {@link setEncoding}.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#binmode`
   * (`vendor/ruby/ext/stringio/stringio.c:1879`).
   */
  binmode(): this {
    this.enc = Encoding.ASCII_8BIT;
    return this;
  }

  /**
   * `strio_set_encoding` (`vendor/ruby/ext/stringio/stringio.c:1801`) in its
   * one-argument form — the encoding is recorded on the stream and, when the
   * StringIO is writable, associated with the buffer String
   * (`stringio.c:1823-1826`); it answers the StringIO. `int_enc` and `opt` are
   * ignored by MRI itself (`stringio.c:1796-1797`), so neither is ported.
   *
   * The buffer already IS a Ruby binary String — one character per byte, see
   * the class comment — so the association `rb_enc_associate` performs is the
   * identity here, and the recorded encoding is what
   * `Rack::Test::Utils.build_file_part`'s `set_encoding(Encoding::BINARY)`
   * (`vendor/rack-test/lib/rack/test/utils.rb:148`) is asking for.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#set_encoding`
   * (`vendor/ruby/ext/stringio/stringio.c:1801`).
   */
  setEncoding(extEnc: Encoding | string): this {
    this.enc = Encoding.find(extEnc);
    return this;
  }

  /**
   * `strio_sysread` (`vendor/ruby/ext/stringio/stringio.c:1664`), which
   * `StringIO#readpartial` is defined as (`stringio.c:1949`): `read` with a
   * `rb_eof_error()` (`vendor/ruby/io.c:756`) where that answers `nil` — the
   * member
   * `Rack::Test::UploadedFile#append_to`
   * (`vendor/rack-test/lib/rack/test/uploaded_file.rb:64`) walks a StringIO
   * body with.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `StringIO#readpartial`
   * (`vendor/ruby/ext/stringio/stringio.c:1949`).
   */
  readpartial(maxlen: number, outbuf?: Uint8Array | null): string {
    const ret = this.read(maxlen, outbuf);
    if (ret === null) throw new EOFError("end of file reached");
    return ret;
  }

  isEof(): boolean {
    return this._pos >= this._string.length;
  }

  close(): void {
    this._closed = true;
  }

  get closed(): boolean {
    return this._closed;
  }
}
