import { DelegateClass } from "./delegate.js";
import { createTmpname } from "./dir.js";
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

/**
 * Ruby's `Tempfile` (stdlib `vendor/ruby/lib/tempfile.rb:89`), which Rails
 * calls from `encrypted_file.rb:90`, `postgresql_database_tasks.rb:132` and
 * `core_ext/file/atomic.rb:24`.
 *
 * `Tempfile < DelegateClass(File)` (`tempfile.rb:89`), so every stream method
 * it does not define is the `File` opened at `tempfile.rb:157`, cursor and
 * all, handed to `super` at `tempfile.rb:165`.
 *
 * {@link open} and {@link create} run a synchronous block inline and return
 * its value directly, the way Ruby does (`vendor/ruby/lib/tempfile.rb:366`,
 * `:438`); an asynchronous block chains its `ensure` onto the Promise.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile`
 * (`vendor/ruby/lib/tempfile.rb:89`), which Rails calls without defining, so
 * no Rails or gem file declares this class.
 */
export class Tempfile extends DelegateClass(File as unknown as new () => File) {
  /** `@unlinked` (`vendor/ruby/lib/tempfile.rb:153`). */
  private unlinked = false;
  /** `@opts` (`vendor/ruby/lib/tempfile.rb:152`). */
  private readonly opts: TempfileOptions;

  private constructor(tmpfile: File, opts: TempfileOptions = {}) {
    super(tmpfile);
    this.opts = opts;
  }

  /**
   * `Tempfile#initialize` (`vendor/ruby/lib/tempfile.rb:150`) — the name comes
   * from `Dir::Tmpname.create`, and the file is opened `RDWR|CREAT|EXCL`
   * (`tempfile.rb:154`) with `perm: 0600` (`tempfile.rb:158`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile.new`
   * (`vendor/ruby/lib/tempfile.rb:150`).
   */
  static new(
    basename: TempfileBasename = "",
    tmpdir?: string,
    options: TempfileOptions = {},
  ): Tempfile {
    return new Tempfile(openExclusive(basename, tmpdir, options), options);
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
  path(): string | null {
    return this.unlinked ? null : this.__getobj__().path();
  }

  /**
   * `Tempfile#open` (`vendor/ruby/lib/tempfile.rb:188`) — closes the delegated
   * `File` and reopens the same path with the creation flags cleared, which is
   * mode `"r+"`, then answers the reopened stream (`tempfile.rb:194`
   * `__getobj__`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#open`
   * (`vendor/ruby/lib/tempfile.rb:188`).
   */
  open(): File {
    const path = this.__getobj__().path()!;
    this.__getobj__().close();
    this.__setobj__(File.open(path, "r+"));
    if (this.opts.encoding != null) this.__getobj__().setEncoding(this.opts.encoding);
    return this.__getobj__();
  }

  /**
   * `Tempfile#size` (`vendor/ruby/lib/tempfile.rb:274`) — `File#size` of the
   * delegated open stream, and `File.size` of the path once it is closed,
   * which is how `Rack::Test::Utils#build_file_part` fills `content-length`
   * (`vendor/rack-test/lib/rack/test/utils.rb:143`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#size`
   * (`vendor/ruby/lib/tempfile.rb:274`).
   */
  size(): number {
    if (!this.__getobj__().isClosed()) {
      return this.__getobj__().size();
    } else {
      return File.size(this.__getobj__().path()!);
    }
  }

  /**
   * `alias length size` (`vendor/ruby/lib/tempfile.rb:281`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#length`
   * (`vendor/ruby/lib/tempfile.rb:281`).
   */
  length(): number {
    return this.size();
  }

  /**
   * `Tempfile#inspect` (`vendor/ruby/lib/tempfile.rb:284`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#inspect`
   * (`vendor/ruby/lib/tempfile.rb:284`).
   */
  inspect(): string {
    if (this.__getobj__().isClosed()) {
      return `#<${this.constructor.name}:${this.path() ?? ""} (closed)>`;
    } else {
      return `#<${this.constructor.name}:${this.path() ?? ""}>`;
    }
  }

  /**
   * `alias to_s inspect` (`vendor/ruby/lib/tempfile.rb:291`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#to_s`
   * (`vendor/ruby/lib/tempfile.rb:291`).
   */
  override toString(): string {
    return this.inspect();
  }

  /**
   * `Tempfile#close(unlink_now = false)` (`vendor/ruby/lib/tempfile.rb:208`),
   * whose `_close` (`tempfile.rb:197`) closes the delegated `File`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#close`
   * (`vendor/ruby/lib/tempfile.rb:208`).
   */
  close(unlinkNow = false): null {
    this.__getobj__().close();
    if (unlinkNow) this.unlink();
    return null;
  }

  /**
   * `Tempfile#close!` (`vendor/ruby/lib/tempfile.rb:214`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#close!`
   * (`vendor/ruby/lib/tempfile.rb:214`).
   */
  closeBang(): true | null {
    this.close();
    return this.unlink();
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
  unlink(): true | null {
    if (this.unlinked) return null;
    try {
      File.delete(this.__getobj__().path()!);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "EACCES") return null;
      if (code !== "ENOENT") throw error;
    }
    return (this.unlinked = true);
  }

  /**
   * `alias delete unlink` (`vendor/ruby/lib/tempfile.rb:264`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Tempfile#delete`
   * (`vendor/ruby/lib/tempfile.rb:264`).
   */
  delete(): true | null {
    return this.unlink();
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
  createTmpname(basename, tmpdir, {}, (path) => {
    tmpfile = File.open(path, "wx+", { perm: 0o600 });
    if (options.encoding != null) tmpfile.setEncoding(options.encoding);
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
