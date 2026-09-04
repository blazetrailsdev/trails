import { getCrypto, File, getOs } from "@blazetrails/ruby-compat";

export type TempfileBasename = string | [string, string];

const UNUSABLE_CHARS = /[^,\-.0-9A-Z_a-z~]/g;

/**
 * `Dir::Tmpname::RANDOM.next` (`tmpdir.rb:126-136`) — `Random.urandom(4)` read
 * as a little-endian `L`, modulo `36**6`, in base 36.
 *
 * @noRailsEquivalent CONVERGEABLE — see {@link Tempfile}; `Dir::Tmpname` is
 *   Ruby stdlib and moves with it when RFC 0129 re-homes these primitives
 *   into `@blazetrails/ruby-compat`.
 */
function random(): string {
  const MAX = 36 ** 6;
  return (Buffer.from(getCrypto().randomBytes(4)).readUInt32LE(0) % MAX).toString(36);
}

/**
 * `Dir::Tmpname.create(basename, tmpdir = nil)` (`tmpdir.rb:139-163`) — yields
 * candidate names until one is not taken, retrying on `Errno::EEXIST`, and
 * returns the name that stuck.
 *
 * Ruby's second name component is `$$`, the process id; trails has no
 * `process.*`, so it is a second draw from {@link random}.
 *
 * @noRailsEquivalent CONVERGEABLE — see {@link Tempfile}; `Dir::Tmpname` is
 *   Ruby stdlib and moves with it when RFC 0129 re-homes these primitives
 *   into `@blazetrails/ruby-compat`.
 */
function createTmpname(
  basename: TempfileBasename,
  tmpdir: string | undefined,
  block: (path: string) => void,
): string {
  tmpdir ??= getOs().tmpdir();
  let [prefix, suffix] = typeof basename === "string" ? [basename, undefined] : basename;
  prefix = prefix.replace(UNUSABLE_CHARS, "");
  suffix &&= suffix.replace(UNUSABLE_CHARS, "");

  let n: number | null = null;
  for (;;) {
    // boundary: `Time.now.strftime("%Y%m%d")` (`tmpdir.rb:152`) — the stamp is
    const t = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const path = File.join(
      tmpdir,
      `${prefix}${t}-${random()}-${random()}${n != null ? `-${n}` : ""}${suffix ?? ""}`,
    );
    try {
      block(path);
      return path;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      n = (n ?? 0) + 1;
    }
  }
}

/**
 * Ruby's `Tempfile` (stdlib `tempfile.rb`), which Rails calls from
 * `encrypted_file.rb:90`, `postgresql_database_tasks.rb:132` and
 * `core_ext/file/atomic.rb:24`.
 *
 * Writes are buffered in memory and flushed by {@link close} and {@link read},
 * the way Ruby's `IO` buffers them behind the descriptor: the fs adapter is
 * open-write-close per call, so there is no descriptor to hold between writes.
 *
 * {@link open} and {@link create} run a synchronous block inline and return its
 * value directly, the way Ruby does (`tempfile.rb:373-379`, `:446-464`); an
 * asynchronous block gets its `ensure` chained onto the returned Promise
 * instead. That is why creation goes through the fs adapter's synchronous
 * primitives: an `async` wrapper would defer a synchronous block's value past
 * every synchronous reader of it.
 *
 * @noRailsEquivalent CONVERGEABLE — `Tempfile` is Ruby stdlib rather than
 *   Rails, so it has no `vendor/rails` anchor and no natural package. It lives
 *   beside activesupport's other unanchored Ruby primitives (`include.ts`)
 *   until it moves to `@blazetrails/ruby-compat` under RFC 0129, as `Range`,
 *   `String#succ` and `rb_equal` already have.
 */
export class Tempfile {
  private readonly tmpname: string;
  private unlinked = false;
  private binary = false;
  private buffer: Buffer = Buffer.alloc(0);
  private flushed = true;

  private constructor(tmpname: string) {
    this.tmpname = tmpname;
  }

  static new(basename: TempfileBasename = "", tmpdir?: string): Tempfile {
    const tmpname = createTmpname(basename, tmpdir, (path) => {
      File.open(path, "wx").close();
      File.chmod(0o600, path);
    });
    return new Tempfile(tmpname);
  }

  static open(basename?: TempfileBasename, tmpdir?: string): Tempfile;
  static open<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tempfile: Tempfile) => T,
  ): T;
  static open<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tempfile: Tempfile) => T,
  ): T | Tempfile {
    const tempfile = Tempfile.new(basename, tmpdir);

    if (block) {
      return ensure(
        () => block(tempfile),
        () => tempfile.close(),
      );
    } else {
      return tempfile;
    }
  }

  static create(basename?: TempfileBasename, tmpdir?: string): Tempfile;
  static create<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tmpfile: Tempfile) => T,
  ): T;
  static create<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tmpfile: Tempfile) => T,
  ): T | Tempfile {
    const tmpfile = Tempfile.new(basename, tmpdir);

    if (block) {
      return ensure(
        () => block(tmpfile),
        () => {
          tmpfile.close();
          tmpfile.unlink();
        },
      );
    } else {
      return tmpfile;
    }
  }

  get path(): string | null {
    return this.unlinked ? null : this.tmpname;
  }

  /**
   * `rb_io_binmode_m` (`vendor/ruby/io.c:6379`), which puts the stream in
   * binary mode and answers the stream. A String written to a binary stream
   * goes out as its own bytes rather than being transcoded, so after this
   * {@link write} takes an ASCII-8BIT String — one character per byte, the
   * encoding `File.binread` answers in.
   *
   * @noRailsEquivalent PERMANENT — see {@link Tempfile}; Ruby core
   *   `IO#binmode` (`vendor/ruby/io.c:6379`), which `Tempfile` delegates.
   */
  binmode(): this {
    this.binary = true;
    return this;
  }

  write(contents: string | Buffer | Uint8Array): number {
    const chunk =
      typeof contents === "string"
        ? Buffer.from(contents, this.binary ? "latin1" : "utf8")
        : contents;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flushed = false;
    return chunk.length;
  }

  read(): Buffer {
    this.flush();
    return File.open(this.tmpname, "rb", (f) => Buffer.from(f.read(), "latin1"));
  }

  private flush(): void {
    if (this.flushed) return;
    File.open(this.tmpname, "wb", (f) => f.write(this.buffer.toString("latin1")));
    this.flushed = true;
  }

  close(unlinkNow = false): void {
    this.flush();
    if (unlinkNow) this.unlink();
  }

  unlink(): void {
    if (this.unlinked) return;
    try {
      File.delete(this.tmpname);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "EACCES") return;
      if (code !== "ENOENT") throw error;
    }
    this.unlinked = true;
  }
}

/**
 * Ruby's `begin ... ensure ... end` around a block whose value is returned:
 * synchronous values run the ensure inline, a Promise chains it on.
 *
 * @noRailsEquivalent CONVERGEABLE — `ensure` is Ruby syntax, so a JS body that
 *   must serve both a synchronous and an asynchronous block has to spell it
 *   out. Removable once RFC 0129 gives these primitives a shared home in
 *   `@blazetrails/ruby-compat` with somewhere for it to live.
 */
function ensure<T>(body: () => T, cleanup: () => void): T {
  let value: T;
  try {
    value = body();
  } catch (error) {
    cleanup();
    throw error;
  }
  if (value instanceof Promise) return value.finally(cleanup) as T;
  cleanup();
  return value;
}
