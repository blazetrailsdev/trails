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
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `StringIO` ships with
 * the interpreter, so no Rails file defines it and no port can remove the need
 * for it while `_parse_file` and `Rack::MockRequest` hand callers an IO.
 */
export class StringIO {
  private _string: string;
  private _pos = 0;
  private _closed = false;

  constructor(string = "") {
    this._string = string;
  }

  /** Ruby: `StringIO#string` — the whole buffer, regardless of position. */
  string(): string {
    return this._string;
  }

  /** Ruby: `StringIO#size` (aliased `length`) — the buffer's bytesize. */
  get size(): number {
    return this._string.length;
  }

  /**
   * Ruby: `StringIO#read` — with no length, the rest of the buffer (`""` at
   * eof); with a length, at most that many characters, or `nil` at eof.
   */
  read(length?: number): string | null {
    if (length == null) {
      const rest = this._string.slice(this._pos);
      this._pos = this._string.length;
      return rest;
    }
    if (this.isEof()) return length === 0 ? "" : null;
    const chunk = this._string.slice(this._pos, this._pos + length);
    this._pos += chunk.length;
    return chunk;
  }

  /**
   * Ruby: `StringIO#write` — overwrites from the current position, advances it
   * past what was written, and returns the number of characters written.
   */
  write(string: string): number {
    this._string =
      this._string.slice(0, this._pos) + string + this._string.slice(this._pos + string.length);
    this._pos += string.length;
    return string.length;
  }

  /** Ruby: `StringIO#rewind`. */
  rewind(): number {
    this._pos = 0;
    return 0;
  }

  /** Ruby: `StringIO#eof?` (aliased `eof`). */
  isEof(): boolean {
    return this._pos >= this._string.length;
  }

  /** Ruby: `StringIO#close`. */
  close(): void {
    this._closed = true;
  }

  /** Ruby: `StringIO#closed?`. */
  get closed(): boolean {
    return this._closed;
  }
}
