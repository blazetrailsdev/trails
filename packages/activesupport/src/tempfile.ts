import { getFsAsync, getPathAsync } from "./fs-adapter.js";
import { ArgumentError } from "./hash-utils.js";
import { getOsAsync } from "./os-adapter.js";

/**
 * A basename is either a String, or a `[prefix, suffix]` pair
 * (`tempfile.rb:224-230`).
 */
export type TempfileBasename = string | [string, string];

/**
 * Ruby's `Tempfile` (stdlib `tempfile.rb`), which Rails calls from
 * `encrypted_file.rb:90`, `postgresql_database_tasks.rb:132` and
 * `core_ext/file/atomic.rb:24`.
 *
 * @noRailsEquivalent CONVERGEABLE — `Tempfile` is Ruby stdlib rather than
 *   Rails, so it has no `vendor/rails` anchor and no natural package. It lives
 *   beside activesupport's other unanchored Ruby primitives (`range-ext.ts`,
 *   `include.ts`, `core-ext/string/succ.ts`) until RFC 0089
 *   (`corelib-primitives`) reactivates and re-homes them together.
 */
export class Tempfile {
  readonly path: string;

  /** The `mkdtemp` directory this temp file was created in; removed by {@link unlink}. */
  private readonly dir: string;

  private constructor(path: string, dir: string) {
    this.path = path;
    this.dir = dir;
  }

  /**
   * `Tempfile.create(basename = "", tmpdir = nil)` (`tempfile.rb:342-374`).
   * With a block, yields the file, then closes AND unlinks it — on the raising
   * path too — and returns the block's value. Without a block, returns the
   * open temp file, which the caller closes and unlinks itself.
   */
  static create(basename?: TempfileBasename, tmpdir?: string): Promise<Tempfile>;
  static create<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tmpfile: Tempfile) => T | Promise<T>,
  ): Promise<T>;
  static create<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tmpfile: Tempfile) => T | Promise<T>,
  ): Promise<T | Tempfile> {
    return Tempfile.mktmp(basename, tmpdir, block, true);
  }

  /**
   * `Tempfile.open(*args)` (`tempfile.rb:307-321`). With a block, yields the
   * file, closes it on block exit and returns the block's value; unlike
   * {@link create} it does NOT unlink — Ruby leaves removal to the finalizer.
   */
  static open(basename?: TempfileBasename, tmpdir?: string): Promise<Tempfile>;
  static open<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tmpfile: Tempfile) => T | Promise<T>,
  ): Promise<T>;
  static open<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tmpfile: Tempfile) => T | Promise<T>,
  ): Promise<T | Tempfile> {
    return Tempfile.mktmp(basename, tmpdir, block, false);
  }

  private static async mktmp<T>(
    basename: TempfileBasename = "",
    tmpdir: string | undefined,
    block: ((tmpfile: Tempfile) => T | Promise<T>) | undefined,
    unlink: boolean,
  ): Promise<T | Tempfile> {
    const tmpfile = await Tempfile.make(basename, tmpdir);

    if (!block) return tmpfile;

    try {
      return await block(tmpfile);
    } finally {
      await tmpfile.close();
      if (unlink) await tmpfile.unlink();
    }
  }

  private static async make(basename: TempfileBasename, tmpdir?: string): Promise<Tempfile> {
    const fs = await getFsAsync();
    const path = await getPathAsync();

    if (!fs.mkdtemp || !fs.writeFile) {
      throw new ArgumentError(
        "Tempfile requires FsAdapter.mkdtemp and FsAdapter.writeFile. " +
          "The configured FsAdapter does not provide them.",
      );
    }

    const [prefix, suffix] = typeof basename === "string" ? [basename, ""] : basename;
    tmpdir ??= (await getOsAsync()).tmpdir();

    // Ruby gets uniqueness from `Dir::Tmpname.create`, which retries an
    // `O_EXCL` open against a name built from the pid and a random suffix. The
    // fs adapter exposes no exclusive-create flag, so the unique seat is an
    // `mkdtemp` directory holding a file with Ruby's basename shape.
    const dir = await fs.mkdtemp(path.join(tmpdir, "tempfile-"));
    const file = path.join(dir, `${prefix}${Tempfile.stamp()}${suffix}`);
    await fs.writeFile(file, "", { mode: 0o600 });
    return new Tempfile(file, dir);
  }

  /** The `%Y%m%d-#{pid}-#{rand}` middle of Ruby's temp basename (`tmpdir.rb:127-136`). */
  private static stamp(): string {
    // boundary: Ruby builds the basename from `Time.now.strftime("%Y%m%d")`;
    // the stamp is a filename component, not a modelled instant.
    const now = new Date();
    const date =
      `${now.getUTCFullYear()}` +
      `${now.getUTCMonth() + 1}`.padStart(2, "0") +
      `${now.getUTCDate()}`.padStart(2, "0");
    return `${date}-${Math.floor(Math.random() * 1000000).toString(36)}`;
  }

  /** `Tempfile#write` — appends to the file, like the Ruby IO. */
  async write(contents: string | Buffer | Uint8Array): Promise<void> {
    const fs = await getFsAsync();
    const existing = await fs.readFile!(this.path);
    const chunk = typeof contents === "string" ? Buffer.from(contents, "utf8") : contents;
    await fs.writeFile!(this.path, Buffer.concat([existing, Buffer.from(chunk)]), { mode: 0o600 });
  }

  /** `Tempfile#read` — the whole file, as Ruby's `IO#read` returns it. */
  async read(): Promise<Buffer> {
    return (await getFsAsync()).readFile!(this.path);
  }

  /**
   * `Tempfile#close` (`tempfile.rb:243-252`). Every read and write opens and
   * closes the file itself, so there is no descriptor left to release.
   */
  close(): Promise<void> {
    return Promise.resolve();
  }

  /** `Tempfile#unlink` (`tempfile.rb:262-275`) — removes the file. */
  async unlink(): Promise<void> {
    const fs = await getFsAsync();
    try {
      await fs.unlink!(this.path);
    } catch {
      /* already gone */
    }
    try {
      await fs.rmdir!(this.dir);
    } catch {
      /* already gone */
    }
  }
}
