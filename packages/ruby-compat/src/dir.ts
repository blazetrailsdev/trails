import { ArgumentError } from "./argument-error.js";
import { rbObjAsString } from "./object.js";
import { RuntimeError } from "./runtime-error.js";
import { getCrypto } from "./crypto-adapter.js";
import { File } from "./file.js";
import { getFs } from "./fs-adapter.js";
import { env, stderr } from "./process-adapter.js";
import { Process } from "./process.js";
import type { TempfileBasename } from "./tempfile.js";
import { verbose } from "./verbose.js";
import { FileUtils } from "./file-utils.js";

/**
 * `Kernel#warn` (`vendor/ruby/error.c:555` `rb_warn_m`), which writes nothing
 * at all while `$VERBOSE` is `nil` (`error.c:561`, `!NIL_P(ruby_verbose)`) —
 * `false` still warns, so the guard is against `nil` alone — and terminates
 * the message with a newline where it lacks one (`error.c:573`).
 */
function warn(message: string): void {
  if (verbose() == null) return;
  stderr.write(`${message}\n`);
}

/** `W_OK` (`vendor/ruby/file.c:1898` `rb_file_writable_p`). */
const W_OK = 2;

/** `File::Stat#writable?` (`vendor/ruby/file.c:1898`), as `access(2)`. */
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

/** `Dir::SYSTMPDIR` (`vendor/ruby/lib/tmpdir.rb:20`). */
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

function fnmatch(segment: string, name: string): boolean {
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

function segmentMatches(segment: string, name: string): boolean {
  return MAGIC.test(segment) ? fnmatch(segment, name) : unescape(segment) === name;
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

/**
 * `Dir` (`vendor/ruby/dir.c:3632` `rb_cDir`), the sliver of it trails calls.
 *
 * Rails reaches directories through this class — `Dir.children(cache_path)` in
 * `vendor/rails/activesupport/lib/active_support/cache/file_store.rb:34`,
 * `Dir.delete(dir)` at `file_store.rb:198`, `Dir.each_child(dir)` at
 * `file_store.rb:210` — so trails reaches them through a class of the same
 * name. The backend is the `FsAdapter` contract in `./fs-adapter.js`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Dir` (`vendor/ruby/dir.c:3632`),
 * which Rails calls without defining, so no Rails or gem file declares the
 * class this file's single export lives in.
 */
export class Dir {
  /**
   * `vendor/ruby/dir.c:1413` `dir_s_getwd`, registered under both `getwd` and
   * `pwd` (`dir.c:3661-3662`) — the path to the current working directory.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.pwd`
   * (`vendor/ruby/dir.c:1413`).
   */
  static pwd(): string {
    return getFs().cwd();
  }

  /**
   * `Dir.tmpdir` (`vendor/ruby/lib/tmpdir.rb:26`) — the first of `TMPDIR`,
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
   * (`vendor/ruby/lib/tmpdir.rb:26`), which Rails calls without defining.
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
   * `Dir.mktmpdir` (`vendor/ruby/lib/tmpdir.rb:91`) — creates a directory
   * under `Dir.tmpdir` named by `Dir::Tmpname.create`, mode `0700`, and
   * answers its path; given a block, yields the path and removes the directory
   * afterwards, raising first when `base` is nil and the parent is
   * world-writable but not sticky (`tmpdir.rb:101-106`).
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `Dir.mktmpdir`
   * (`vendor/ruby/lib/tmpdir.rb:91`), which Rails calls without defining.
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
   * `vendor/ruby/dir.c:1494` `dir_s_mkdir` — ONE directory, so a missing
   * parent is an `Errno::ENOENT` and an existing `dirname` an `Errno::EEXIST`,
   * which is the pair `Entry_#copy`'s directory arm rescues
   * (`vendor/ruby/lib/fileutils.rb:2248-2252`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.mkdir`
   * (`vendor/ruby/dir.c:1494`).
   */
  static mkdir(dirname: string): number {
    getFs().mkdirSync(dirname);
    return 0;
  }

  /**
   * `vendor/ruby/dir.c:3421` `dir_s_children`: every entry EXCEPT `"."` and
   * `".."`, and it raises rather than answering `[]` when the directory is
   * missing.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.children`
   * (`vendor/ruby/dir.c:3421`).
   */
  static children(dirname: string): string[] {
    return getFs().readdirSync(dirname);
  }

  /**
   * `vendor/ruby/dir.c:3288` `dir_foreach`, which yields `"."` and `".."`
   * ahead of the entries `Dir.children` answers — the two `dir_each` reads
   * out of the directory stream and `dir_each_entry` filters only for
   * `each_child` — and raises rather than yielding nothing when the directory
   * is missing.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.foreach`
   * (`vendor/ruby/dir.c:3288`).
   */
  static foreach(dirname: string, block: (filename: string) => void): null {
    const children = Dir.children(dirname);
    for (const filename of [".", "..", ...children]) block(filename);
    return null;
  }

  /**
   * `vendor/ruby/dir.c:3347` `dir_s_each_child`, which yields each of
   * `Dir.children`'s names.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.each_child`
   * (`vendor/ruby/dir.c:3347`).
   */
  static eachChild(dirname: string, block: (filename: string) => void): void {
    for (const filename of Dir.children(dirname)) block(filename);
  }

  /**
   * `vendor/ruby/dir.c:1535` `dir_s_rmdir`, which answers `0` and removes only
   * an EMPTY directory.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.delete`
   * (`vendor/ruby/dir.c:1535`).
   */
  static delete(dirname: string): number {
    getFs().rmdirSync(dirname);
    return 0;
  }

  /**
   * `vendor/ruby/dir.c:3227` `dir_s_glob`. Three things node's globbers get
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
   * (`vendor/ruby/dir.c:3227`).
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
 * The `max_try:` and `**opts` keywords of `Dir::Tmpname.create`
 * (`vendor/ruby/lib/tmpdir.rb:140`); `Dir.mktmpdir` forwards its own
 * `**options` there (`tmpdir.rb:93`).
 *
 * @noRailsEquivalent PERMANENT — the option hash of Ruby stdlib
 * `Dir::Tmpname.create` (`vendor/ruby/lib/tmpdir.rb:140`).
 */
export interface TmpnameOptions {
  maxTry?: number | null;
  [key: string]: unknown;
}

/**
 * `Dir::Tmpname.create(basename, tmpdir = nil, max_try: nil, **opts)`
 * (`vendor/ruby/lib/tmpdir.rb:140`) — yields candidate names until one is not
 * taken, retrying on `Errno::EEXIST`, and returns the name that stuck.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `Dir::Tmpname.create`
 * (`vendor/ruby/lib/tmpdir.rb:140`).
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
