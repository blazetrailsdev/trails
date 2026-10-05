import { ArgumentError } from "./argument-error.js";
import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "./async-context-adapter.js";
import { rbObjAsString } from "./object.js";
import { RuntimeError } from "./runtime-error.js";
import { TypeError } from "./type-error.js";
import { getCrypto } from "./crypto-adapter.js";
import { File } from "./file.js";
import { getFs } from "./fs-adapter.js";
import { chdir, env } from "./process-adapter.js";
import { Process } from "./process.js";
import type { TempfileBasename } from "./tempfile.js";
import { warn } from "./kernel-warn.js";
import { FileUtils } from "./file-utils.js";

/** `W_OK` (`vendor/ruby/v3.3.11/file.c:1898` `rb_file_writable_p`). */
const W_OK = 2;

/** `File::Stat#writable?` (`vendor/ruby/v3.3.11/file.c:1898`), as `access(2)`. */
function isWritable(dir: string): boolean {
  const accessSync = getFs().accessSync;
  if (!accessSync) return true;
  try {
    accessSync(dir, W_OK);
    return true;
  } catch {
    return false;
  }
}

/** `chdir_blocking` (`vendor/ruby/v3.3.11/dir.c:1044`), the count of open `Dir.chdir` blocks. */
let chdirBlocking = 0;

/**
 * `chdir_thread` (`vendor/ruby/v3.3.11/dir.c:1045`), the owner of the open
 * `Dir.chdir` blocks. A block runs under an owner of its own, carried by the
 * async context as ruby-compat's `synchronize` carries a monitor's
 * (`./monitor.js`), and a block opened inside it shares that owner.
 */
let chdirThread: symbol | null = null;
let chdirStorage: AsyncContext<symbol> | null = null;
let chdirAdapter: AsyncContextAdapter | null = null;

/** The context whose store is `rb_thread_current()` as `chdir_path` reads it (`vendor/ruby/v3.3.11/dir.c:1083`). */
function chdirContext(): AsyncContext<symbol> {
  const adapter = getAsyncContext();
  if (!chdirStorage || chdirAdapter !== adapter) {
    chdirStorage = adapter.create<symbol>();
    chdirAdapter = adapter;
  }
  return chdirStorage;
}

/** `Dir::SYSTMPDIR` (`vendor/ruby/v3.3.11/lib/tmpdir.rb:20`). */
const SYSTMPDIR = "/tmp";

const MAGIC = /[*?[{]/;

function braceExpand(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  const alternatives: string[] = [];
  let start = open + 1;
  for (let i = open; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        alternatives.push(pattern.slice(start, i));
        close = i;
        break;
      }
    } else if (char === "," && depth === 1) {
      alternatives.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  if (close === -1) return [pattern];
  const prefix = pattern.slice(0, open);
  const suffix = pattern.slice(close + 1);
  return alternatives.flatMap((alternative) => braceExpand(`${prefix}${alternative}${suffix}`));
}

function fnmatch(segment: string, name: string, flags = 0): boolean {
  let source = "";
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (char === "\\" && i + 1 < segment.length) {
      source += segment[++i].replace(/[.*+?^${}()|[\]\\]/, "\\$&");
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "[") {
      const close = segment.indexOf("]", i + 1);
      if (close === -1) {
        source += "\\[";
      } else {
        const body = segment.slice(i + 1, close).replace(/^!/, "^");
        source += `[${body}]`;
        i = close;
      }
    } else source += char.replace(/[.*+?^${}()|[\]\\]/, "\\$&");
  }
  if (!new RegExp(`^${source}$`).test(name)) return false;
  if ((flags & File.FNM_DOTMATCH) !== 0) return true;
  return !name.startsWith(".") || segment.startsWith(".");
}

function children(dirname: string): string[] {
  try {
    return getFs().readdirSync(dirname).sort();
  } catch {
    return [];
  }
}

function unescape(segment: string): string {
  return segment.replace(/\\(.)/g, "$1");
}

function segmentMatches(segment: string, name: string, flags = 0): boolean {
  return MAGIC.test(segment) ? fnmatch(segment, name, flags) : unescape(segment) === name;
}

function globHelper(base: string, segments: string[], found: string[], enumerated: boolean): void {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    if (enumerated || File.isExist(base)) found.push(base);
    return;
  }
  const join = (name: string): string =>
    base.endsWith(File.SEPARATOR) ? `${base}${name}` : `${base}${File.SEPARATOR}${name}`;
  if (segment === "**" && rest.length > 0) {
    for (const name of children(base)) {
      if (name.startsWith(".")) continue;
      if (segmentMatches(rest[0], name)) globHelper(join(name), rest.slice(1), found, true);
      if (File.isDirectory(join(name))) globHelper(join(name), segments, found, true);
    }
    return;
  }
  if (!MAGIC.test(segment)) {
    globHelper(join(unescape(segment)), rest, found, false);
    return;
  }
  for (const name of children(base)) {
    if (!fnmatch(segment === "**" ? "*" : segment, name)) continue;
    globHelper(join(name), rest, found, true);
  }
}

async function childrenAsync(dirname: string, skipdot: boolean): Promise<string[]> {
  let names: string[];
  try {
    names = (await Dir.childrenAsync(dirname)).sort();
  } catch {
    return [];
  }
  return skipdot ? names : [".", ...names];
}

async function isDirectoryAsync(path: string): Promise<boolean> {
  const fs = getFs();
  try {
    return (fs.lstat ? await fs.lstat(path) : fs.lstatSync(path)).isDirectory();
  } catch {
    return false;
  }
}

async function globHelperAsync(
  base: string,
  segments: string[],
  found: string[],
  enumerated: boolean,
  flags: number,
  skipdot: boolean,
): Promise<void> {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    if (enumerated || (await getFs().exists(base))) found.push(base);
    return;
  }
  const join = (name: string): string =>
    base.endsWith(File.SEPARATOR) ? `${base}${name}` : `${base}${File.SEPARATOR}${name}`;
  const dotmatch = (flags & File.FNM_DOTMATCH) !== 0;
  if (segment === "**" && rest.length > 0) {
    for (const name of await childrenAsync(base, skipdot || !dotmatch)) {
      if (name.startsWith(".") && !dotmatch) continue;
      if (segmentMatches(rest[0], name, flags))
        await globHelperAsync(join(name), rest.slice(1), found, true, flags, true);
      if (name === ".") continue;
      if (await isDirectoryAsync(join(name)))
        await globHelperAsync(join(name), segments, found, true, flags, true);
    }
    return;
  }
  if (!MAGIC.test(segment)) {
    await globHelperAsync(join(unescape(segment)), rest, found, false, flags, skipdot);
    return;
  }
  for (const name of await childrenAsync(base, skipdot)) {
    if (!fnmatch(segment === "**" ? "*" : segment, name, flags)) continue;
    await globHelperAsync(join(name), rest, found, true, flags, true);
  }
}

/**
 * `Dir` (`vendor/ruby/v3.3.11/dir.c:3632` `rb_cDir`), the sliver of it trails calls.
 *
 * Rails reaches directories through this class — `Dir.children(cache_path)` in
 * `vendor/rails/v8.0.2/activesupport/lib/active_support/cache/file_store.rb:34`,
 * `Dir.delete(dir)` at `file_store.rb:198`, `Dir.each_child(dir)` at
 * `file_store.rb:210` — so trails reaches them through a class of the same
 * name. The backend is the `FsAdapter` contract in `./fs-adapter.js`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Dir` (`vendor/ruby/v3.3.11/dir.c:3632`),
 * which Rails calls without defining, so no Rails or gem file declares the
 * class this file's single export lives in.
 */
export class Dir {
  /**
   * `vendor/ruby/v3.3.11/dir.c:1413` `dir_s_getwd`, registered under both `getwd` and
   * `pwd` (`dir.c:3661-3662`) — the path to the current working directory.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.pwd`
   * (`vendor/ruby/v3.3.11/dir.c:1413`).
   */
  static pwd(): string {
    return getFs().cwd();
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:1172` `dir_s_chdir` — `HOME`, then `LOGDIR`,
   * when no path is given, and `rb_get_path`'s `TypeError` for a given `nil` — and `chdir_path` (`dir.c:1080-1107`): given a
   * block, changes into `path`, yields it, and restores the previous directory
   * in `rb_ensure`'s `chdir_restore` (`dir.c:1066-1076`), answering the
   * block's value; without one, changes directory and answers `0`.
   *
   * A block that returns a promise has not finished when it returns, so the
   * restore waits for it to settle, resolved or rejected. `chdir_path`'s
   * `conflicting chdir` `RuntimeError` (`dir.c:1083-1084`) raises from another
   * thread than the block's, which here is a call from outside the open
   * block's async context: a sibling promise, where a nested call shares it.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.chdir`
   * (`vendor/ruby/v3.3.11/dir.c:1172`).
   */
  static chdir(path?: string): number;
  static chdir<T>(path: string | undefined, block: (path: string) => T): T;
  static chdir<T>(path?: string | null, block?: (path: string) => T): number | T {
    if (path !== undefined) {
      if (path === null) throw new TypeError("no implicit conversion of nil into String");
    } else {
      const dist = env["HOME"] ?? env["LOGDIR"];
      if (dist == null) throw new ArgumentError("HOME/LOGDIR not set");
      path = dist;
    }

    const storage = chdirContext();
    if (chdirBlocking > 0) {
      if (storage.getStore() !== chdirThread) {
        throw new RuntimeError("conflicting chdir during another chdir block");
      }
      if (block == null) warn("warning: conflicting chdir during another chdir block");
    }

    if (block != null) {
      const oldPath = Dir.pwd();
      chdir(path);
      chdirBlocking++;
      const thread = storage.getStore() ?? Symbol("chdir");
      if (chdirThread === null) chdirThread = thread;
      const chdirRestore = (): void => {
        chdirBlocking--;
        if (chdirBlocking === 0) chdirThread = null;
        chdir(oldPath);
      };
      let result: T;
      try {
        result = storage.run(thread, () => block(path));
      } catch (error) {
        chdirRestore();
        throw error;
      }
      if (result != null && typeof (result as { then?: unknown }).then === "function") {
        return Promise.resolve(result).finally(chdirRestore) as T;
      }
      chdirRestore();
      return result;
    } else {
      chdir(path);
    }

    return 0;
  }

  /**
   * `Dir.tmpdir` (`vendor/ruby/v3.3.11/lib/tmpdir.rb:26`) — the first of `TMPDIR`,
   * `TMP`, `TEMP`, `SYSTMPDIR` (`tmpdir.rb:20`, `/tmp` off a build without
   * `Etc.systmpdir`), `/tmp` and `.` that names a writable directory, and
   * `ArgumentError` when none does (`tmpdir.rb:43`).
   *
   * `stat.writable?` (`tmpdir.rb:35`) is effective-process writability, so it
   * goes through the adapter's `access(2)` with `W_OK`; an adapter without one
   * reports every directory writable. `world_writable?` / `sticky?`
   * (`tmpdir.rb:37`) are the `0o002` and `0o1000` bits of the stat's mode.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Dir.tmpdir`
   * (`vendor/ruby/v3.3.11/lib/tmpdir.rb:26`), which Rails calls without defining.
   */
  static tmpdir(): string {
    const candidates: [string, string | undefined][] = [
      ["TMPDIR", undefined],
      ["TMP", undefined],
      ["TEMP", undefined],
      ["system temporary path", SYSTMPDIR],
      ["/tmp", "/tmp"],
      [".", "."],
    ];

    for (const [name, fixed] of candidates) {
      let dir = fixed;
      if (dir == null) {
        dir = env[name];
        if (dir == null || dir === "") continue;
      }
      dir = File.expandPath(dir);
      let stat;
      try {
        stat = File.stat(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) {
        warn(`${name} is not a directory: ${dir}`);
      } else if (!isWritable(dir)) {
        warn(`${name} is not writable: ${dir}`);
      } else if ((stat.mode & 0o002) !== 0 && (stat.mode & 0o1000) === 0) {
        warn(`${name} is world-writable: ${dir}`);
      } else {
        return dir;
      }
    }
    throw new ArgumentError("could not find a temporary directory");
  }

  /**
   * `Dir.mktmpdir` (`vendor/ruby/v3.3.11/lib/tmpdir.rb:91`) — creates a directory
   * under `Dir.tmpdir` named by `Dir::Tmpname.create`, mode `0700`, and
   * answers its path; given a block, yields the path and removes the directory
   * afterwards, raising first when `base` is nil and the parent is
   * world-writable but not sticky (`tmpdir.rb:101-106`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Dir.mktmpdir`
   * (`vendor/ruby/v3.3.11/lib/tmpdir.rb:91`), which Rails calls without defining.
   */
  static mktmpdir(
    prefixSuffix?: TempfileBasename | null,
    tmpdir?: string | null,
    options?: TmpnameOptions,
  ): string;
  static mktmpdir<T>(
    prefixSuffix: TempfileBasename | null,
    tmpdir: string | null,
    options: TmpnameOptions,
    block: (path: string) => T,
  ): T;
  static mktmpdir<T>(
    prefixSuffix: TempfileBasename | null = null,
    tmpdir: string | null = null,
    options: TmpnameOptions = {},
    block?: (path: string) => T,
  ): string | T {
    let base: string | undefined = undefined;
    const path = createTmpname(
      prefixSuffix ?? "d",
      tmpdir ?? undefined,
      options,
      (path, _n, _opts, d) => {
        base = d;
        Dir.mkdir(path);
        getFs().chmodSync?.(path, 0o700);
      },
    );
    if (block != null) {
      try {
        return block(path);
      } finally {
        if (base == null) {
          const stat = File.stat(File.dirname(path));
          if ((stat.mode & 0o002) !== 0 && (stat.mode & 0o1000) === 0) {
            // eslint-disable-next-line no-unsafe-finally
            throw new ArgumentError("parent directory is world writable but not sticky");
          }
        }
        FileUtils.removeEntry(path);
      }
    } else {
      return path;
    }
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:1494` `dir_s_mkdir` — ONE directory, so a missing
   * parent is an `Errno::ENOENT` and an existing `dirname` an `Errno::EEXIST`,
   * which is the pair `Entry_#copy`'s directory arm rescues
   * (`vendor/ruby/v3.3.11/lib/fileutils.rb:2248-2252`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.mkdir`
   * (`vendor/ruby/v3.3.11/dir.c:1494`).
   */
  static mkdir(dirname: string): number {
    getFs().mkdirSync(dirname);
    return 0;
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:3421` `dir_s_children`: every entry EXCEPT `"."` and
   * `".."`, and it raises rather than answering `[]` when the directory is
   * missing.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.children`
   * (`vendor/ruby/v3.3.11/dir.c:3421`).
   */
  static children(dirname: string): string[] {
    return getFs().readdirSync(dirname);
  }

  /** {@link Dir.children} over the backend's async `readdir`, or its `readdirSync`.
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.children` (`vendor/ruby/v3.3.11/dir.c:3421`).
   */
  static async childrenAsync(dirname: string): Promise<string[]> {
    const fs = getFs();
    return fs.readdir ? await fs.readdir(dirname) : fs.readdirSync(dirname);
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:3288` `dir_foreach`, which yields `"."` and `".."`
   * ahead of the entries `Dir.children` answers — the two `dir_each` reads
   * out of the directory stream and `dir_each_entry` filters only for
   * `each_child` — and raises rather than yielding nothing when the directory
   * is missing.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.foreach`
   * (`vendor/ruby/v3.3.11/dir.c:3288`).
   */
  static foreach(dirname: string, block: (filename: string) => void): null {
    const children = Dir.children(dirname);
    for (const filename of [".", "..", ...children]) block(filename);
    return null;
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:3347` `dir_s_each_child`, which yields each of
   * `Dir.children`'s names.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.each_child`
   * (`vendor/ruby/v3.3.11/dir.c:3347`).
   */
  static eachChild(dirname: string, block: (filename: string) => void): void {
    for (const filename of Dir.children(dirname)) block(filename);
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:1535` `dir_s_rmdir`, which answers `0` and removes only
   * an EMPTY directory.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.delete`
   * (`vendor/ruby/v3.3.11/dir.c:1535`).
   */
  static delete(dirname: string): number {
    getFs().rmdirSync(dirname);
    return 0;
  }

  /**
   * `vendor/ruby/v3.3.11/dir.c:3227` `dir_s_glob`. Three things node's globbers get
   * wrong. `**` matching ZERO directories is tried on each entry before that
   * entry is descended into, so the two depths interleave rather than a
   * directory's own matches all preceding its children's —
   * `Dir.glob("g/**\/*.rb")` answers `g/B.rb`, `g/a/x.rb`, `g/a.rb` in that
   * order. A leading dot is matched only by a literal dot (`dir.c:325`).
   * And entries come out of each directory sorted, which is `sort: true`, the
   * default since Ruby 3.0 (`dir.c:3210`).
   *
   * A backslash escapes the character after it (`dir.c:314`), in the brace
   * expansion (`dir.c:3019`) as well as in a segment, so
   * `Dir.glob("{a\\,b/*}")` walks the one directory named `a,b` rather than
   * expanding to two patterns.
   *
   * A broken symlink is answered, because it is a directory entry
   * (`dir.c:3421`) rather than something `File.exist?` is asked about — which
   * is what the `enumerated` argument below carries: a path reached purely
   * through literal segments has never been proved to exist, so it is the one
   * that still needs the stat.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.glob`
   * (`vendor/ruby/v3.3.11/dir.c:3227`).
   */
  static glob(pattern: string): string[] {
    const found: string[] = [];
    for (const expanded of braceExpand(pattern)) {
      const absolute = expanded.startsWith(File.SEPARATOR);
      const segments = expanded.split(File.SEPARATOR);
      if (absolute) segments.shift();
      globHelper(absolute ? File.SEPARATOR : ".", segments, found, false);
    }
    if (pattern.startsWith(".")) return found;
    return found.map((entry) => (entry.startsWith("./") ? entry.slice(2) : entry));
  }

  /**
   * {@link Dir.glob} over the backend's async `readdir` / `lstat` / `exists`
   * (its sync `readdirSync` / `lstatSync` where it has no async one), taking
   * the `flags` `dir_s_glob` does. `File::FNM_DOTMATCH` is the one flag read,
   * as `glob_helper` (`vendor/ruby/v3.3.11/dir.c:2528`) reads it: a wildcard
   * then matches a leading dot (`dir.c:325`), `**` descends dot directories
   * (`dir.c:2762`) though never a symlink (`dir.c:2759`), and `.` is among the
   * entries of the first directory read — `Dir.glob("g/*", File::FNM_DOTMATCH)`
   * answers `g/.` — until `FNM_GLOB_SKIPDOT` is set for the ones beneath it
   * (`dir.c:2692-2693`). `..` never is (`dir.c:2713`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.glob`
   * (`vendor/ruby/v3.3.11/dir.c:3227`).
   */
  static async globAsync(pattern: string, flags: number = 0): Promise<string[]> {
    const found: string[] = [];
    for (const expanded of braceExpand(pattern)) {
      const absolute = expanded.startsWith(File.SEPARATOR);
      const segments = expanded.split(File.SEPARATOR);
      if (absolute) segments.shift();
      await globHelperAsync(absolute ? File.SEPARATOR : ".", segments, found, false, flags, false);
    }
    if (pattern.startsWith(".")) return found;
    return found.map((entry) => (entry.startsWith("./") ? entry.slice(2) : entry));
  }
}

/** `Dir::Tmpname::UNUSABLE_CHARS` (`vendor/ruby/v3.3.11/lib/tmpdir.rb:123`). */
const UNUSABLE_CHARS = /[^,\-.0-9A-Z_a-z~]/g;

/**
 * `Dir::Tmpname::RANDOM.next` (`vendor/ruby/v3.3.11/lib/tmpdir.rb:132`) —
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
 * The `max_try:` and `**opts` keywords of `Dir::Tmpname.create`
 * (`vendor/ruby/v3.3.11/lib/tmpdir.rb:140`); `Dir.mktmpdir` forwards its own
 * `**options` there (`tmpdir.rb:93`).
 *
 * @noRailsEquivalent PERMANENT — the option hash of Ruby stdlib
 * `Dir::Tmpname.create` (`vendor/ruby/v3.3.11/lib/tmpdir.rb:140`).
 */
export interface TmpnameOptions {
  maxTry?: number | null;
  [key: string]: unknown;
}

/**
 * `Dir::Tmpname.create(basename, tmpdir = nil, max_try: nil, **opts)`
 * (`vendor/ruby/v3.3.11/lib/tmpdir.rb:140`) — yields candidate names until one is not
 * taken, retrying on `Errno::EEXIST`, and returns the name that stuck.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Dir::Tmpname.create`
 * (`vendor/ruby/v3.3.11/lib/tmpdir.rb:140`).
 */
export function createTmpname(
  basename: TempfileBasename,
  tmpdir: string | undefined,
  { maxTry = null, ...opts }: TmpnameOptions,
  block: (
    path: string,
    n: number | null,
    opts: Record<string, unknown>,
    origdir: string | undefined,
  ) => void,
): string {
  const origdir = tmpdir;
  tmpdir ??= Dir.tmpdir();
  let [prefix, suffix] = typeof basename === "string" ? [basename, undefined] : basename;
  prefix = prefix.replace(UNUSABLE_CHARS, "");
  suffix &&= suffix.replace(UNUSABLE_CHARS, "");

  let n: number | null = null;
  for (;;) {
    const now = new Date();
    const t = `${String(now.getFullYear()).padStart(4, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const path = File.join(
      tmpdir,
      `${prefix}${t}-${Process.pid}-${random()}${n != null ? `-${n}` : ""}${suffix ?? ""}`,
    );
    try {
      block(path, n, opts, origdir);
      return path;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      n = (n ?? 0) + 1;
      if (maxTry == null || n < maxTry) continue;
      throw new RuntimeError(
        `cannot generate temporary name using \`${rbObjAsString(basename)}' under \`${tmpdir}'`,
      );
    }
  }
}
