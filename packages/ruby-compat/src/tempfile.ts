import { getCrypto } from "./crypto-adapter.js";
import { Dir } from "./dir.js";
import { File } from "./file.js";

/**
 * The `basename` argument of `Tempfile.new` (`vendor/ruby/lib/tempfile.rb:150`):
 * a prefix, or a `[prefix, suffix]` pair destructured by
 * `Dir::Tmpname.create` (`vendor/ruby/lib/tmpdir.rb:144`).
 *
 * @noRailsEquivalent PERMANENT — the argument type of Ruby stdlib
 * `Tempfile.new` (`vendor/ruby/lib/tempfile.rb:150`), which Rails calls
 * without defining.
 */
export type TempfileBasename = string | [string, string];

/** `Dir::Tmpname::UNUSABLE_CHARS` (`vendor/ruby/lib/tmpdir.rb:123`). */
const UNUSABLE_CHARS = /[^,\-.0-9A-Z_a-z~]/g;

/**
 * `Dir::Tmpname::RANDOM.next` (`vendor/ruby/lib/tmpdir.rb:132`) —
 * `Random.urandom(4)` read as a little-endian `L`, modulo `36**6`
 * (`tmpdir.rb:129`), in base 36.
 */
function random(): string {
  const MAX = 36 ** 6;
  const bytes = getCrypto().randomBytes(4);
  const l = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  return (l % MAX).toString(36);
}

/**
 * `Dir::Tmpname.create(basename, tmpdir = nil)`
 * (`vendor/ruby/lib/tmpdir.rb:140`) — yields candidate names until one is not
 * taken, retrying on `Errno::EEXIST`, and returns the name that stuck.
 *
 * Ruby's second name component is `$$`, the process id
 * (`vendor/ruby/lib/tmpdir.rb:154`); trails has no `process.*`, so it is a
 * second draw from {@link random}.
 */
function createTmpname(
  basename: TempfileBasename,
  tmpdir: string | undefined,
  block: (path: string) => void,
): string {
  tmpdir ??= Dir.tmpdir();
  let [prefix, suffix] = typeof basename === "string" ? [basename, undefined] : basename;
  prefix = prefix.replace(UNUSABLE_CHARS, "");
  suffix &&= suffix.replace(UNUSABLE_CHARS, "");

  let n: number | null = null;
  for (;;) {
    /* boundary: `Time.now.strftime("%Y%m%d")` (`vendor/ruby/lib/tmpdir.rb:153`)
       — the stamp is local-time in Ruby and UTC here. */
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
 * Ruby's `Tempfile` (stdlib `vendor/ruby/lib/tempfile.rb:89`), which Rails
 * calls from `encrypted_file.rb:90`, `postgresql_database_tasks.rb:132` and
 * `core_ext/file/atomic.rb:24`.
 *
 * Writes are buffered in memory and flushed by {@link close} and {@link read},
 * the way Ruby's `IO` buffers them behind the descriptor: the fs adapter is
 * open-write-close per call, so there is no descriptor to hold between writes.
 *
 * {@link open} and {@link create} run a synchronous block inline and return its
 * value directly, the way Ruby does (`vendor/ruby/lib/tempfile.rb:366`,
 * `:438`); an asynchronous block gets its `ensure` chained onto the returned
 * Promise instead. That is why creation goes through the fs adapter's
 * synchronous primitives: an `async` wrapper would defer a synchronous block's
 * value past every synchronous reader of it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile`
 * (`vendor/ruby/lib/tempfile.rb:89`), which Rails calls without defining, so
 * no Rails or gem file declares this class.
 */
export class Tempfile {
  private readonly tmpname: string;
  private unlinked = false;
  private buffer: Uint8Array = new Uint8Array(0);
  private flushed = true;

  private constructor(tmpname: string) {
    this.tmpname = tmpname;
  }

  /**
   * `Tempfile#initialize` (`vendor/ruby/lib/tempfile.rb:150`) — the name comes
   * from `Dir::Tmpname.create`, and the file is opened `RDWR|CREAT|EXCL` with
   * `perm: 0600` (`tempfile.rb:154-159`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile.new`
   * (`vendor/ruby/lib/tempfile.rb:150`).
   */
  static new(basename: TempfileBasename = "", tmpdir?: string): Tempfile {
    const tmpname = createTmpname(basename, tmpdir, (path) => {
      File.open(path, "wx").close();
      File.chmod(0o600, path);
    });
    return new Tempfile(tmpname);
  }

  /**
   * `Tempfile.open` (`vendor/ruby/lib/tempfile.rb:366`) — with a block, yields
   * the tempfile and closes it in an `ensure`, leaving the file in place;
   * without one, returns the tempfile.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile.open`
   * (`vendor/ruby/lib/tempfile.rb:366`).
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
   * `Tempfile.create` (`vendor/ruby/lib/tempfile.rb:438`) — like
   * {@link open}, except the `ensure` also unlinks (`tempfile.rb:447-461`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile.create`
   * (`vendor/ruby/lib/tempfile.rb:438`).
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

  /**
   * `Tempfile#path` (`vendor/ruby/lib/tempfile.rb:268`) — `nil` once
   * {@link unlink} has run.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#path`
   * (`vendor/ruby/lib/tempfile.rb:268`).
   */
  get path(): string | null {
    return this.unlinked ? null : this.tmpname;
  }

  /**
   * `IO#write` (`vendor/ruby/io.c:2263` `io_write_m`), reached through
   * `Tempfile`'s `DelegateClass(File)` (`vendor/ruby/lib/tempfile.rb:89`) —
   * returns the number of bytes written.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#write`
   * (`vendor/ruby/io.c:2263`), delegated by Ruby stdlib `Tempfile`.
   */
  write(contents: string | Uint8Array): number {
    const chunk = typeof contents === "string" ? new TextEncoder().encode(contents) : contents;
    const grown = new Uint8Array(this.buffer.length + chunk.length);
    grown.set(this.buffer);
    grown.set(chunk, this.buffer.length);
    this.buffer = grown;
    this.flushed = false;
    return chunk.length;
  }

  /**
   * `IO#read` (`vendor/ruby/io.c:3774` `io_read`), reached through
   * `Tempfile`'s `DelegateClass(File)` (`vendor/ruby/lib/tempfile.rb:89`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#read`
   * (`vendor/ruby/io.c:3774`), delegated by Ruby stdlib `Tempfile`.
   */
  read(): Uint8Array {
    this.flush();
    return File.open(this.tmpname, "rb", (f) => toBytes(f.read()));
  }

  private flush(): void {
    if (this.flushed) return;
    File.open(this.tmpname, "wb", (f) => f.write(fromBytes(this.buffer)));
    this.flushed = true;
  }

  /**
   * `Tempfile#close(unlink_now = false)`
   * (`vendor/ruby/lib/tempfile.rb:208`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#close`
   * (`vendor/ruby/lib/tempfile.rb:208`).
   */
  close(unlinkNow = false): void {
    this.flush();
    if (unlinkNow) this.unlink();
  }

  /**
   * `Tempfile#unlink` (`vendor/ruby/lib/tempfile.rb:252`) — swallows
   * `Errno::ENOENT`, and returns without marking the file unlinked on
   * `Errno::EACCES`, which is Windows refusing to unlink an open file
   * (`tempfile.rb:255-259`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#unlink`
   * (`vendor/ruby/lib/tempfile.rb:252`).
   */
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
 * The byte-per-`charCode` String Ruby's binary `IO#read` returns
 * (`vendor/ruby/io.c:3774`), as bytes — the inverse of {@link fromBytes}, and
 * the same round trip `IO#read` already does at `./io.ts`.
 */
function toBytes(string: string): Uint8Array {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) bytes[i] = string.charCodeAt(i) & 0xff;
  return bytes;
}

/** Bytes as the String Ruby's binary `IO#write` takes (`vendor/ruby/io.c:2263`). */
function fromBytes(bytes: Uint8Array): string {
  let string = "";
  for (const byte of bytes) string += String.fromCharCode(byte);
  return string;
}

/**
 * Ruby's `begin ... ensure ... end` around a block whose value is returned
 * (`vendor/ruby/lib/tempfile.rb:369-374`): synchronous values run the ensure
 * inline, a Promise chains it on.
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
