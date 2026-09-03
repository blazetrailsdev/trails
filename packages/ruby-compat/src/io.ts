import { getFs } from "./fs-adapter.js";

/** The `rb_exec_recursive` guard `io_puts_ary` (`vendor/ruby/io.c:8880`) is called through. */
const putsAryInFlight = new Set<unknown[]>();

/** The receiver `rb_io_puts` sends to (`vendor/ruby/io.c:8947`). */
export interface GenericWritable {
  write(string: string): number;
}

/**
 * `rb_io_puts` (`vendor/ruby/io.c:8947`), reached both as `IO#puts`
 * (`io.c:15459`) and, through `IO::generic_writable`, as `StringIO#puts`
 * (`vendor/ruby/ext/stringio/stringio.c:1530`) — one body, two receivers, which
 * is why it lives here rather than beside `StringIO`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `IO#puts` (`vendor/ruby/io.c:8947`).
 */
export function puts(this: GenericWritable, ...args: unknown[]): null {
  if (args.length === 0) {
    this.write("\n");
    return null;
  }
  for (let i = 0; i < args.length; i++) {
    let line: string;
    if (typeof args[i] === "string") {
      line = args[i] as string;
    } else if (Array.isArray(args[i])) {
      ioPutsAry.call(this, args[i] as unknown[]);
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

/**
 * `io_puts_ary` (`vendor/ruby/io.c:8880`), the recursion guard `rb_io_puts`
 * reaches an Array argument through.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `io_puts_ary`
 * (`vendor/ruby/io.c:8880`).
 */
export function ioPutsAry(this: GenericWritable, ary: unknown[]): void {
  if (putsAryInFlight.has(ary)) {
    puts.call(this, "[...]");
    return;
  }
  putsAryInFlight.add(ary);
  try {
    for (let i = 0; i < ary.length; i++) {
      puts.call(this, ary[i]);
    }
  } finally {
    putsAryInFlight.delete(ary);
  }
}

/**
 * `IO` (`vendor/ruby/io.c:15371` `rb_cIO`), the sliver of it trails calls.
 *
 * Rails writes a credentials file through this class —
 * `IO.binwrite "#{content_path}.tmp", encrypt(contents)`
 * (`vendor/rails/activesupport/lib/active_support/encrypted_file.rb:79`) — so
 * trails writes it through a class of the same name. The backend is the
 * `FsAdapter` contract in `./fs-adapter.js`, the same one `File` writes through.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `IO` (`vendor/ruby/io.c:15371`),
 * which Rails calls without defining, so no Rails or gem file declares the
 * class this file's export lives in.
 */
export class IO {
  /**
   * The descriptor `rb_io_s_open` (`vendor/ruby/io.c:8148`) opened the stream
   * on, and the offset `rb_io_seek_m` (`io.c:2495`) moves — Ruby's `rb_io_t`
   * holds both.
   */
  protected fd: number;

  /** @internal */
  private pos = 0;

  /**
   * `rb_io_initialize` (`vendor/ruby/io.c:9207`), reached as `IO.new(fd)`. It
   * is protected because `File.open` (`io.c:8148`) is the only way trails
   * opens a stream, and a public TS constructor is measured surface.
   */
  protected constructor(fd: number) {
    this.fd = fd;
  }

  /**
   * `vendor/ruby/io.c:12121` `rb_io_s_readlines`, in its whole-file form:
   * every line of the file, each keeping its trailing separator.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO.readlines`
   * (`vendor/ruby/io.c:12121`).
   */
  static readlines(name: string): string[] {
    const lines = getFs()
      .readFileSync(name, "utf-8")
      .split(/(?<=\n)/);
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  }

  /**
   * `vendor/ruby/io.c:12396` `rb_io_s_binwrite`, which is `IO.write`
   * (`io.c:12377`) with the stream opened in binary mode. The trails buffer is
   * already a binary String — one character per byte — so the two differ only
   * in the encoding they would apply, and the byte count is the return value
   * either way (`io_s_write`, `io.c:12285`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO.binwrite`
   * (`vendor/ruby/io.c:12396`).
   */
  static binwrite(name: string, string: string): number {
    getFs().writeFileSync(name, string);
    return string.length;
  }

  /**
   * `vendor/ruby/io.c:2495` `rb_io_seek_m` in its one-argument form, where
   * `whence` is `IO::SEEK_SET` — the absolute offset the next read starts at.
   * It answers `0`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#seek`
   * (`vendor/ruby/io.c:2495`).
   */
  seek(amount: number): number {
    this.pos = amount;
    return 0;
  }

  /**
   * `vendor/ruby/io.c:3774` `io_read`, which answers at most `length` bytes
   * and `nil` — never `""` — once the stream is at EOF and `length` is
   * positive. The bytes come back as a binary String, one character per byte,
   * which is the ASCII-8BIT `File.open(path, "rb")` reads in — assembled a
   * character at a time because no `TextDecoder` encoding gives it: its
   * "latin1" is windows-1252, and that remaps 0x80-0x9F.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#read`
   * (`vendor/ruby/io.c:3774`).
   */
  read(length: number): string | null {
    const buffer = new Uint8Array(length);
    const read = getFs().readSync(this.fd, buffer, 0, length, this.pos);
    if (read === 0) return length === 0 ? "" : null;
    this.pos += read;
    let part = "";
    for (let i = 0; i < read; i++) part += String.fromCharCode(buffer[i]);
    return part;
  }

  /**
   * `vendor/ruby/io.c:5777` `rb_io_close_m`, which answers `nil`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#close`
   * (`vendor/ruby/io.c:5777`).
   */
  close(): null {
    getFs().closeSync(this.fd);
    return null;
  }
}
