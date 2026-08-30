import { getCrypto } from "./crypto-adapter.js";
import { getFs, getPath } from "./fs-adapter.js";
import { getOs } from "./os-adapter.js";

/** The `basename` of `Dir::Tmpname.create`: a String, or a `[prefix, suffix]` pair. */
export type TempfileBasename = string | [string, string];

/** `Dir::Tmpname::UNUSABLE_CHARS` (`tmpdir.rb:122`), as the complement class it names. */
const UNUSABLE_CHARS = /[^,\-.0-9A-Z_a-z~]/g;

/**
 * `Dir::Tmpname::RANDOM.next` (`tmpdir.rb:126-136`) — `Random.urandom(4)` read
 * as a little-endian `L`, modulo `36**6`, in base 36.
 *
 * @noRailsEquivalent CONVERGEABLE — see {@link Tempfile}; `Dir::Tmpname` is
 *   Ruby stdlib and moves with it when RFC 0089 re-homes these primitives.
 */
function random(): string {
  const MAX = 36 ** 6;
  return (getCrypto().randomBytes(4).readUInt32LE(0) % MAX).toString(36);
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
 *   Ruby stdlib and moves with it when RFC 0089 re-homes these primitives.
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
    // a filename component, not a modelled instant.
    const t = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const path = getPath().join(
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
  private buffer: Buffer = Buffer.alloc(0);
  private flushed = true;

  private constructor(tmpname: string) {
    this.tmpname = tmpname;
  }

  /**
   * `Tempfile.new(basename = "", tmpdir = nil)` (`tempfile.rb:150-166`).
   *
   * `File.open(tmpname, RDWR|CREAT|EXCL, perm: 0600)` is `openSync(path, "wx")`
   * — the exclusive create whose `EEXIST` is what {@link createTmpname} retries
   * on — followed by `chmodSync`, since the adapter's `openSync` takes no mode.
   */
  static new(basename: TempfileBasename = "", tmpdir?: string): Tempfile {
    const fs = getFs();
    const tmpname = createTmpname(basename, tmpdir, (path) => {
      fs.closeSync(fs.openSync(path, "wx"));
      fs.chmodSync?.(path, 0o600);
    });
    return new Tempfile(tmpname);
  }

  /**
   * `Tempfile.open(*args)` (`tempfile.rb:366-380`). With a block, yields the
   * file and closes it on block exit, returning the block's value; without one,
   * returns the open file. Unlike {@link create} it does not unlink — Ruby
   * leaves removal to the finalizer, which JS has no equivalent of, so a
   * caller of this form removes the file itself.
   */
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

  /**
   * `Tempfile.create(basename = "", tmpdir = nil)` (`tempfile.rb:438-465`).
   * With a block, yields the file, then closes and unlinks it — on the raising
   * path too — and returns the block's value; without one, returns the open
   * file, which the caller closes and unlinks itself.
   */
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

  /** `Tempfile#path` (`tempfile.rb:268-270`) — nil once {@link unlink} has run. */
  get path(): string | null {
    return this.unlinked ? null : this.tmpname;
  }

  /** `IO#write` — appends, and returns the number of bytes written. */
  write(contents: string | Buffer | Uint8Array): number {
    const chunk = typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.flushed = false;
    return chunk.length;
  }

  /** `IO#read` — the whole file. */
  read(): Buffer {
    this.flush();
    return getFs().readFileSync(this.tmpname);
  }

  /** `IO#flush` — writes the buffered bytes through to the file. */
  private flush(): void {
    if (this.flushed) return;
    getFs().writeFileSync(this.tmpname, this.buffer, { mode: 0o600 });
    this.flushed = true;
  }

  /**
   * `Tempfile#close(unlink_now = false)` (`tempfile.rb:208-211`). Ruby's
   * `_close` releases the descriptor; there is none to release here, so what
   * closing does is flush the buffered writes.
   */
  close(unlinkNow = false): void {
    this.flush();
    if (unlinkNow) this.unlink();
  }

  /**
   * `Tempfile#unlink` (`tempfile.rb:252-265`). `ENOENT` is swallowed and
   * `EACCES` returns without marking the file unlinked, the way Ruby leaves a
   * Windows unlink-before-close for a later `close!` to retry.
   */
  unlink(): void {
    if (this.unlinked) return;
    try {
      getFs().unlinkSync(this.tmpname);
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
 *   out. Removable once RFC 0089 gives these primitives a shared home with
 *   somewhere for it to live.
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
