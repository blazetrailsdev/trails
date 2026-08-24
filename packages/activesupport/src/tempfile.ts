import { getFsAsync, getPathAsync } from "./fs-adapter.js";
import { ArgumentError } from "./hash-utils.js";
import { getOsAsync } from "./os-adapter.js";

/** The `basename` of `Dir::Tmpname.create`: a String, or a `[prefix, suffix]` pair. */
export type TempfileBasename = string | [string, string];

/** `Dir::Tmpname::UNUSABLE_CHARS` (`tmpdir.rb:122`), as the complement class it names. */
const UNUSABLE_CHARS = /[^,\-.0-9A-Z_a-z~]/g;

/**
 * `Dir::Tmpname.create(basename, tmpdir = nil)` (`tmpdir.rb:139-163`).
 *
 * Ruby yields candidate names and retries on `Errno::EEXIST`, which is what
 * makes the name unique. The fs adapter exposes no exclusive-create flag, so
 * the candidate is placed inside a fresh `mkdtemp` directory instead and the
 * `EEXIST` retry loop has nothing left to retry.
 *
 * @noRailsEquivalent CONVERGEABLE — see {@link Tempfile}; `Dir::Tmpname` is
 *   Ruby stdlib and moves with it when RFC 0089 re-homes these primitives.
 */
async function createTmpname(basename: TempfileBasename, tmpdir?: string): Promise<string> {
  const fs = await getFsAsync();
  const path = await getPathAsync();

  if (!fs.mkdtemp || !fs.writeFile) {
    throw new ArgumentError(
      "Tempfile requires FsAdapter.mkdtemp and FsAdapter.writeFile. " +
        "The configured FsAdapter does not provide them.",
    );
  }

  tmpdir ??= (await getOsAsync()).tmpdir();
  let [prefix, suffix] = typeof basename === "string" ? [basename, undefined] : basename;
  prefix = prefix.replace(UNUSABLE_CHARS, "");
  suffix &&= suffix.replace(UNUSABLE_CHARS, "");

  // boundary: `Time.now.strftime("%Y%m%d")` (`tmpdir.rb:152`) — the stamp is a
  // filename component, not a modelled instant.
  const t = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  // Ruby's second component is `$$`, the process id; trails has no `process.*`,
  // so it is a second draw from the same generator as `RANDOM.next`.
  return path.join(
    await fs.mkdtemp(path.join(tmpdir, "tempfile-")),
    `${prefix}${t}-${random()}-${random()}${suffix ?? ""}`,
  );
}

/** `Dir::Tmpname::RANDOM.next` (`tmpdir.rb:126-136`) — up to 6 base-36 bytes. */
function random(): string {
  return Math.floor(Math.random() * 36 ** 6).toString(36);
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
 * @noRailsEquivalent CONVERGEABLE — `Tempfile` is Ruby stdlib rather than
 *   Rails, so it has no `vendor/rails` anchor and no natural package. It lives
 *   beside activesupport's other unanchored Ruby primitives (`range-ext.ts`,
 *   `include.ts`, `core-ext/string/succ.ts`) until RFC 0089
 *   (`corelib-primitives`) reactivates and re-homes them together.
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
   * Ruby's `initialize` opens the file; a TypeScript constructor cannot await,
   * so the Ruby name lives on the static factory instead.
   */
  static async new(basename: TempfileBasename = "", tmpdir?: string): Promise<Tempfile> {
    const tmpname = await createTmpname(basename, tmpdir);
    // `opts[:perm] = 0600` (`tempfile.rb:159`).
    await (
      await getFsAsync()
    ).writeFile!(tmpname, "", { mode: 0o600 });
    return new Tempfile(tmpname);
  }

  /**
   * `Tempfile.open(*args)` (`tempfile.rb:366-380`). With a block, yields the
   * file and closes it on block exit, returning the block's value; without one,
   * returns the open file. Unlike {@link create} it does not unlink — Ruby
   * leaves removal to the finalizer, which JS has no equivalent of, so a
   * caller of this form removes the file itself.
   */
  static open(basename?: TempfileBasename, tmpdir?: string): Promise<Tempfile>;
  static open<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tempfile: Tempfile) => T | Promise<T>,
  ): Promise<T>;
  static async open<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tempfile: Tempfile) => T | Promise<T>,
  ): Promise<T | Tempfile> {
    const tempfile = await Tempfile.new(basename, tmpdir);

    if (block) {
      try {
        return await block(tempfile);
      } finally {
        await tempfile.close();
      }
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
  static create(basename?: TempfileBasename, tmpdir?: string): Promise<Tempfile>;
  static create<T>(
    basename: TempfileBasename | undefined,
    tmpdir: string | undefined,
    block: (tmpfile: Tempfile) => T | Promise<T>,
  ): Promise<T>;
  static async create<T>(
    basename?: TempfileBasename,
    tmpdir?: string,
    block?: (tmpfile: Tempfile) => T | Promise<T>,
  ): Promise<T | Tempfile> {
    const tmpfile = await Tempfile.new(basename, tmpdir);

    if (block) {
      try {
        return await block(tmpfile);
      } finally {
        await tmpfile.close();
        await tmpfile.unlink();
      }
    } else {
      return tmpfile;
    }
  }

  /**
   * `Tempfile#path` (`tempfile.rb:268-270`) — nil once {@link unlink} has run.
   */
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
  async read(): Promise<Buffer> {
    await this.flush();
    return (await getFsAsync()).readFile!(this.tmpname);
  }

  /** `IO#flush` — writes the buffered bytes through to the file. */
  async flush(): Promise<void> {
    if (this.flushed) return;
    await (
      await getFsAsync()
    ).writeFile!(this.tmpname, this.buffer, { mode: 0o600 });
    this.flushed = true;
  }

  /**
   * `Tempfile#close(unlink_now = false)` (`tempfile.rb:208-211`). Ruby's
   * `_close` releases the descriptor; there is none to release here, so what
   * closing does is flush the buffered writes.
   */
  async close(unlinkNow = false): Promise<void> {
    await this.flush();
    if (unlinkNow) await this.unlink();
  }

  /** `Tempfile#unlink` (`tempfile.rb:252-265`) — removes the file. */
  async unlink(): Promise<void> {
    if (this.unlinked) return;
    const fs = await getFsAsync();
    const path = await getPathAsync();
    try {
      await fs.unlink!(this.tmpname);
    } catch (error) {
      // `rescue Errno::ENOENT` (`tempfile.rb:256`).
      if ((error as { code?: string }).code !== "ENOENT") throw error;
    }
    // The name came from a dedicated `mkdtemp` directory (see
    // `createTmpname`), so removing the file leaves that directory to remove
    // too; Ruby has no such directory and so no counterpart line.
    await fs.rmdir!(path.dirname(this.tmpname));
    this.unlinked = true;
  }
}
