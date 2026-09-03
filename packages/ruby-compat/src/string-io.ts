/** The `rb_exec_recursive` guard `io_puts_ary` (`vendor/ruby/io.c:8880`) is called through. */
const putsAryInFlight = new Set<unknown[]>();

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

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `StringIO` mixes in
   * `IO#puts` (`vendor/ruby/ext/stringio/stringio.c:1530,1958` aliases it to
   * `rb_io_puts`, `vendor/ruby/io.c:8947`), which is how
   * `Rack::Session::Abstract::Persisted#commit_session` writes to `rack.errors`.
   */
  puts(...args: unknown[]): null {
    if (args.length === 0) {
      this.write("\n");
      return null;
    }
    for (let i = 0; i < args.length; i++) {
      let line: string;
      if (typeof args[i] === "string") {
        line = args[i] as string;
      } else if (Array.isArray(args[i])) {
        this.ioPutsAry(args[i] as unknown[]);
        continue;
      } else {
        line = args[i] == null ? "" : String(args[i]);
      }

      if (line.length === 0) {
        this.write("\n");
      } else {
        this.write(line);
        if (!line.endsWith("\n")) this.write("\n");
      }
    }

    return null;
  }

  /** `io_puts_ary` (`vendor/ruby/io.c:8880`). */
  private ioPutsAry(ary: unknown[]): void {
    if (putsAryInFlight.has(ary)) {
      this.puts("[...]");
      return;
    }
    putsAryInFlight.add(ary);
    try {
      for (let i = 0; i < ary.length; i++) {
        this.puts(ary[i]);
      }
    } finally {
      putsAryInFlight.delete(ary);
    }
  }

  /**
   * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `strio_flush`
   * (`vendor/ruby/ext/stringio/stringio.c:1891`) returns the StringIO itself,
   * which is how `Rack::ShowExceptions#call` flushes `rack.errors`.
   */
  flush(): this {
    return this;
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
