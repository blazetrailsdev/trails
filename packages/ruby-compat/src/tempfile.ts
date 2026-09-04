import { getCrypto } from "./crypto-adapter.js";
import { Dir } from "./dir.js";
import { Encoding } from "./encoding.js";
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

/**
 * The `**options` of `Tempfile.new` (`vendor/ruby/lib/tempfile.rb:150`), which
 * Ruby forwards to `File.open` (`tempfile.rb:157`) — `Rack::Multipart::
 * UploadedFile` passes `encoding: Encoding::BINARY`
 * (`vendor/rack/lib/rack/multipart/uploaded_file.rb:24`).
 *
 * @noRailsEquivalent PERMANENT — the option hash of Ruby stdlib
 * `Tempfile.new` (`vendor/ruby/lib/tempfile.rb:150`), which Rails calls
 * without defining.
 */
export interface TempfileOptions {
  encoding?: Encoding | string;
}

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
 * `Tempfile < DelegateClass(File)` (`tempfile.rb:89`), so every stream method
 * is the `File` opened at `tempfile.rb:157`, cursor and all — `write` advances
 * the offset the same way `IO#write` does (`vendor/ruby/io.c:2263`). The
 * delegation is spelled out per method because TypeScript has no
 * `method_missing` a typed stream can use.
 *
 * {@link open} and {@link create} run a synchronous block inline and return
 * its value directly, the way Ruby does (`vendor/ruby/lib/tempfile.rb:366`,
 * `:438`); an asynchronous block chains its `ensure` onto the Promise.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile`
 * (`vendor/ruby/lib/tempfile.rb:89`), which Rails calls without defining, so
 * no Rails or gem file declares this class.
 */
export class Tempfile {
  /** `__getobj__` (`vendor/ruby/lib/tempfile.rb:165`), the delegated `File`. */
  private readonly tmpfile: File;
  /** `@unlinked` (`vendor/ruby/lib/tempfile.rb:153`). */
  private unlinked = false;

  private constructor(tmpfile: File) {
    this.tmpfile = tmpfile;
  }

  /**
   * `Tempfile#initialize` (`vendor/ruby/lib/tempfile.rb:150`) — the name comes
   * from `Dir::Tmpname.create`, and the file is opened `RDWR|CREAT|EXCL`
   * (`tempfile.rb:154`) with `perm: 0600` (`tempfile.rb:158`).
   *
   * `FsAdapter.openSync` takes no permission argument, so `0600` is a `chmod`
   * behind the exclusive create rather than the `open(2)` mode.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile.new`
   * (`vendor/ruby/lib/tempfile.rb:150`).
   */
  static new(
    basename: TempfileBasename = "",
    tmpdir?: string,
    options: TempfileOptions = {},
  ): Tempfile {
    return new Tempfile(openExclusive(basename, tmpdir, options));
  }

  /**
   * `Tempfile.open` (`vendor/ruby/lib/tempfile.rb:366`) — with a block, yields
   * the tempfile and closes it in an `ensure` (`tempfile.rb:369-374`), leaving
   * the file in place; without one, returns the tempfile.
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
   * `Tempfile.create` (`vendor/ruby/lib/tempfile.rb:438`), which is NOT a
   * `Tempfile`: it opens a plain `File` (`tempfile.rb:444`) and yields or
   * returns that, so the caller gets no finalizer and no `Tempfile` surface.
   * The `ensure` unlinks BEFORE closing while the path still names the open
   * file (`tempfile.rb:449-453`), which is the unlink-after-creation practice
   * `Tempfile.create` exists to give on POSIX, and falls back to unlinking
   * after the close when that did not happen (`tempfile.rb:455-460`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile.create`
   * (`vendor/ruby/lib/tempfile.rb:438`).
   */
  static create(basename?: TempfileBasename, tmpdir?: string): File;
  static create<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tmpfile: File) => T,
  ): T;
  static create<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tmpfile: File) => T,
  ): T | File {
    const tmpfile = openExclusive(basename, tmpdir);

    if (block) {
      return ensure(
        () => block(tmpfile),
        () => {
          let unlinked: number | null = null;
          if (!tmpfile.isClosed()) {
            if (File.isIdentical(tmpfile, tmpfile.path()!)) {
              try {
                unlinked = File.delete(tmpfile.path()!);
              } catch {
                unlinked = null;
              }
            }
            tmpfile.close();
          }
          if (unlinked == null) {
            try {
              File.delete(tmpfile.path()!);
            } catch (error) {
              if ((error as { code?: string }).code !== "ENOENT") throw error;
            }
          }
        },
      );
    } else {
      return tmpfile;
    }
  }

  /**
   * `Tempfile#path` (`vendor/ruby/lib/tempfile.rb:268`) — `__getobj__.path`,
   * and `nil` once {@link unlink} has run.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#path`
   * (`vendor/ruby/lib/tempfile.rb:268`).
   */
  get path(): string | null {
    return this.unlinked ? null : this.tmpfile.path();
  }

  /**
   * `IO#binmode` (`vendor/ruby/io.c:6379`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`), so `atomic_write`'s
   * `temp_file.binmode` (`core_ext/file/atomic.rb:25`) puts the held `File` in
   * binary mode and {@link write} stops transcoding.
   *
   * `rb_io_binmode_m` answers the stream it was sent, and `DelegateClass`
   * forwards that through untouched — so this answers the `File`, not the
   * `Tempfile`. MRI agrees: `Tempfile.new("x").binmode.class` is `File`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#binmode`
   * (`vendor/ruby/io.c:6379`), delegated by Ruby stdlib `Tempfile`.
   */
  binmode(): File {
    return this.tmpfile.binmode();
  }

  /**
   * `IO#set_encoding` (`vendor/ruby/io.c:13474` `rb_io_set_encoding`) on the
   * delegated `File` (`vendor/ruby/lib/tempfile.rb:89`), which is how
   * `Rack::Test::UploadedFile#initialize_from_file_path`
   * (`vendor/rack-test/lib/rack/test/uploaded_file.rb:93`) puts the tempfile
   * in binary before `FileUtils.copy_file` writes the bytes in.
   *
   * `rb_io_set_encoding` answers the stream it was sent and `DelegateClass`
   * forwards that through untouched, so this answers the `File`, not the
   * `Tempfile` — the same way {@link binmode} does.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#set_encoding`
   * (`vendor/ruby/io.c:13474`), delegated by Ruby stdlib `Tempfile`.
   */
  setEncoding(extEnc: Encoding | string): File {
    return this.tmpfile.setEncoding(extEnc);
  }

  /**
   * `IO#binmode?` (`vendor/ruby/io.c:6400`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#binmode?`
   * (`vendor/ruby/io.c:6400`), delegated by Ruby stdlib `Tempfile`.
   */
  isBinmode(): boolean {
    return this.tmpfile.isBinmode();
  }

  /**
   * `IO#write` (`vendor/ruby/io.c:2263` `io_write_m`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`): the bytes go to the descriptor at the
   * current offset, which the write then advances.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#write`
   * (`vendor/ruby/io.c:2263`), delegated by Ruby stdlib `Tempfile`.
   */
  write(string: string): number {
    return this.tmpfile.write(string);
  }

  /**
   * `IO#read` (`vendor/ruby/io.c:3774` `io_read`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`): the rest of the stream FROM THE
   * CURRENT OFFSET, so a read straight after a write answers `""` until
   * {@link rewind} moves the cursor back.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#read`
   * (`vendor/ruby/io.c:3774`), delegated by Ruby stdlib `Tempfile`.
   */
  read(): string {
    return this.tmpfile.read();
  }

  /**
   * `IO#readpartial` (`vendor/ruby/io.c:3590`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`), which is how
   * `Rack::Test::UploadedFile#append_to`
   * (`vendor/rack-test/lib/rack/test/uploaded_file.rb:64`) walks the tempfile
   * in 64K chunks.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#readpartial`
   * (`vendor/ruby/io.c:3590`), delegated by Ruby stdlib `Tempfile`.
   */
  readpartial(maxlen: number, outbuf?: Uint8Array | null): string {
    return this.tmpfile.readpartial(maxlen, outbuf);
  }

  /**
   * `IO#eof?` (`vendor/ruby/io.c:2668`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`) — the `until` guard on
   * `Rack::Test::UploadedFile#append_to`'s chunk loop
   * (`vendor/rack-test/lib/rack/test/uploaded_file.rb:64`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#eof?`
   * (`vendor/ruby/io.c:2668`), delegated by Ruby stdlib `Tempfile`.
   */
  isEof(): boolean {
    return this.tmpfile.isEof();
  }

  /**
   * `IO#rewind` (`vendor/ruby/io.c:2565`) on the delegated `File`
   * (`vendor/ruby/lib/tempfile.rb:89`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `IO#rewind`
   * (`vendor/ruby/io.c:2565`), delegated by Ruby stdlib `Tempfile`.
   */
  rewind(): number {
    return this.tmpfile.rewind();
  }

  /**
   * `Tempfile#close(unlink_now = false)` (`vendor/ruby/lib/tempfile.rb:208`),
   * whose `_close` (`tempfile.rb:197`) closes the delegated `File`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#close`
   * (`vendor/ruby/lib/tempfile.rb:208`).
   */
  close(unlinkNow = false): void {
    this.tmpfile.close();
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
      File.delete(this.tmpfile.path()!);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "EACCES") return;
      if (code !== "ENOENT") throw error;
    }
    this.unlinked = true;
  }
}

/**
 * The `Dir::Tmpname.create` block both `Tempfile#initialize`
 * (`vendor/ruby/lib/tempfile.rb:156-160`) and `Tempfile.create`
 * (`vendor/ruby/lib/tempfile.rb:440-445`) pass: open the candidate name
 * `RDWR|CREAT|EXCL` with `perm: 0600`, retrying the name on `Errno::EEXIST`.
 */
function openExclusive(
  basename: TempfileBasename = "",
  tmpdir?: string,
  options: TempfileOptions = {},
): File {
  let tmpfile: File | null = null;
  createTmpname(basename, tmpdir, (path) => {
    tmpfile = File.open(path, "wx+");
    if (options.encoding != null) tmpfile.setEncoding(options.encoding);
    File.chmod(0o600, path);
  });
  return tmpfile!;
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
