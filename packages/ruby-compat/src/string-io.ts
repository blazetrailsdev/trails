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

  constructor(string = "") {
    this._string = string;
  }

  string(): string {
    return this._string;
  }

  get size(): number {
    return this._string.length;
  }

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

  write(string: string): number {
    this._string =
      this._string.slice(0, this._pos) + string + this._string.slice(this._pos + string.length);
    this._pos += string.length;
    return string.length;
  }

  puts(string = ""): null {
    this.write(string.endsWith("\n") ? string : `${string}\n`);
    return null;
  }

  rewind(): number {
    this._pos = 0;
    return 0;
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
