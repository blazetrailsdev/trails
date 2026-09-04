import { getFs, type FsStatResult } from "./fs-adapter.js";
import { IOError } from "./io-error.js";

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

/** `vendor/ruby/io.c:160` `IO_RBUF_CAPA_MIN`, the read buffer Ruby fills. */
const READ_CHUNK = 8192;

/**
 * The ASCII-8BIT String a binary read answers (`rb_ascii8bit_encoding`,
 * `vendor/ruby/io.c:12257`): one character per byte. It is assembled a
 * character at a time because no `TextDecoder` encoding gives it — its
 * "latin1" is windows-1252, which remaps 0x80-0x9F.
 */
function binaryString(bytes: Uint8Array, length: number): string {
  let part = "";
  for (let i = 0; i < length; i++) part += String.fromCharCode(bytes[i]);
  return part;
}

/** The bytes `io_write_m` (`vendor/ruby/io.c:2263`) sends an ASCII-8BIT String as. */
function binaryBytes(string: string): Uint8Array {
  const buffer = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) buffer[i] = string.charCodeAt(i) & 0xff;
  return buffer;
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

  /** `fptr->pathv` (`vendor/ruby/io.c:2943` reads it back as `IO#path`). */
  protected pathv: string | null;

  /** `FMODE_BINMODE` (`vendor/ruby/io.c:6311` `rb_io_binmode` sets it). */
  protected binary = false;

  /** @internal */
  private pos = 0;

  /**
   * `rb_io_initialize` (`vendor/ruby/io.c:9207`), reached as `IO.new(fd)`. It
   * is protected because `File.open` (`io.c:8148`) is the only way trails
   * opens a stream, and a public TS constructor is measured surface.
   */
  protected constructor(fd: number, pathv: string | null = null) {
    this.fd = fd;
    this.pathv = pathv;
  }

  /**
   * `vendor/ruby/io.c:6379` `rb_io_binmode_m`, which puts the stream in binary
   * mode and answers the stream. A String written to a binary stream goes out
   * as its own bytes rather than being transcoded, so after this {@link write}
   * takes an ASCII-8BIT String — one character per byte, the encoding
   * {@link IO#read} already answers in.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#binmode`
   * (`vendor/ruby/io.c:6379`).
   */
  binmode(): this {
    this.binary = true;
    return this;
  }

  /**
   * `vendor/ruby/io.c:2943` `rb_io_path`, registered as both `IO#path` and
   * `IO#to_path` (`io.c:15544-15545`) — the path the stream was opened on.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#path`
   * (`vendor/ruby/io.c:2943`).
   */
  path(): string | null {
    return this.pathv;
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
   * `vendor/ruby/io.c:12242` `rb_io_s_binread`, which opens the stream
   * `FMODE_BINMODE` under `rb_ascii8bit_encoding()` (`io.c:12257`) and so
   * answers the file's BYTES — one character per byte, never a decoded
   * String. `IO.read` (`io.c:12200`) is the member that decodes.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO.binread`
   * (`vendor/ruby/io.c:12242`).
   */
  static binread(name: string): string {
    const bytes = getFs().readFileSync(name);
    return binaryString(bytes, bytes.length);
  }

  /**
   * `vendor/ruby/io.c:12396` `rb_io_s_binwrite`, which is `IO.write`
   * (`io.c:12377`) with the stream opened in binary mode: `string` is an
   * ASCII-8BIT String and its characters go to the file as bytes, so
   * {@link IO.binread} answers it back unchanged. The byte count is the return
   * value either way (`io_s_write`, `io.c:12285`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO.binwrite`
   * (`vendor/ruby/io.c:12396`).
   */
  static binwrite(name: string, string: string): number {
    const buffer = binaryBytes(string);
    getFs().writeFileSync(name, buffer);
    return buffer.length;
  }

  /**
   * `vendor/ruby/io.c:2858` `rb_io_fileno` — the integer descriptor the
   * stream was opened on.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#fileno`
   * (`vendor/ruby/io.c:2858`).
   */
  fileno(): number {
    return this.fd;
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
   * `vendor/ruby/io.c:2565` `rb_io_rewind` — the offset goes back to the start
   * of the stream, and it answers `0`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#rewind`
   * (`vendor/ruby/io.c:2565`).
   */
  rewind(): number {
    return this.seek(0);
  }

  /**
   * `vendor/ruby/io.c:5842` `rb_io_closed_p`, which is `fptr->fd < 0` — the
   * same test `rb_io_close_m` (`io.c:5779`) short-circuits on.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#closed?`
   * (`vendor/ruby/io.c:5842`).
   */
  isClosed(): boolean {
    return this.fd < 0;
  }

  /**
   * `vendor/ruby/io.c:2075` `rb_io_stat` — `fstat(2)` of the descriptor, where
   * `File.stat` names a path. It raises on a closed stream, and on an adapter
   * with no `fstat` there is no descriptor identity to answer with.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#stat`
   * (`vendor/ruby/io.c:2075`).
   */
  stat(): FsStatResult {
    const fstatSync = getFs().fstatSync;
    if (this.fd < 0) throw new IOError("closed stream");
    if (!fstatSync) throw new IOError("fstat is unavailable in this runtime");
    return fstatSync(this.fd);
  }

  /**
   * `vendor/ruby/io.c:3774` `io_read`, which behaves like C's `fread` and so
   * retries `read(2)` until `length` bytes are in hand or the stream hits EOF
   * (`io.c:3760-3763`) — a short read is not an answer. It answers `nil` —
   * never `""` — once the stream is at EOF and `length` is positive. The bytes
   * come back as a binary String, one character per byte, which is the
   * ASCII-8BIT `File.open(path, "rb")` reads in — assembled a character at a
   * time because no `TextDecoder` encoding gives it: its "latin1" is
   * windows-1252, and that remaps 0x80-0x9F.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#read`
   * (`vendor/ruby/io.c:3774`).
   */
  read(): string;
  read(length: number): string | null;
  read(length?: number): string | null {
    if (length === undefined) return this.readAll();

    const buffer = new Uint8Array(length);
    let n = 0;
    while (n < length) {
      const read = getFs().readSync(this.fd, buffer, n, length - n, this.pos + n);
      if (read === 0) break;
      n += read;
    }
    if (n === 0) return length === 0 ? "" : null;
    this.pos += n;
    return binaryString(buffer, n);
  }

  /**
   * `vendor/ruby/io.c:3317` `read_all`, which `io_read` (`io.c:3774`) takes
   * when `length` is `nil`: the rest of the stream, and `""` rather than `nil`
   * at EOF. Ruby sizes the read from `remain_size(fptr)`, an `fstat` the
   * `FsAdapter` contract has no member for, so the bytes come in chunks.
   */
  private readAll(): string {
    const buffer = new Uint8Array(READ_CHUNK);
    let part = "";
    for (;;) {
      const read = getFs().readSync(this.fd, buffer, 0, buffer.length, this.pos);
      if (read === 0) return part;
      this.pos += read;
      part += binaryString(buffer, read);
    }
  }

  /**
   * `vendor/ruby/io.c:2263` `io_write_m` in its one-argument form, which
   * answers the number of bytes written. On a binary stream — {@link binmode},
   * or a mode carrying `b` (`rb_io_binmode`, `io.c:6311`) — `string` is an
   * ASCII-8BIT String and its characters go out as bytes; otherwise it is
   * transcoded to the external encoding, which for trails is always UTF-8.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#write`
   * (`vendor/ruby/io.c:2263`).
   */
  write(string: string): number {
    const buffer = this.binary ? binaryBytes(string) : new TextEncoder().encode(string);
    let n = 0;
    while (n < buffer.length) {
      n += getFs().writeSync(this.fd, buffer, n, buffer.length - n, this.pos + n);
    }
    this.pos += n;
    return n;
  }

  /**
   * `vendor/ruby/io.c:5777` `rb_io_close_m`, which answers `nil` — and answers
   * it without closing anything when `fptr->fd < 0` (`io.c:5779-5781`), so a
   * second close is a no-op rather than an error — which `atomic_write` leans
   * on, closing the temp file at `core_ext/file/atomic.rb:30` inside a
   * `Tempfile.open` whose `ensure` closes it again (`tempfile.rb:372`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#close`
   * (`vendor/ruby/io.c:5777`).
   */
  close(): null {
    if (this.fd < 0) return null;
    getFs().closeSync(this.fd);
    this.fd = -1;
    return null;
  }
}
