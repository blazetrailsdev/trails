import { getFs, getPath } from "./fs-adapter.js";
import type { FsStatResult } from "./fs-adapter.js";
import { IO } from "./io.js";

/**
 * `rb_stat` (`vendor/ruby/file.c:1296`), which `fstat`s an open stream and
 * `stat`s a name, answering `< 0` — `null` here — where the call fails.
 */
function rbStat(file: IO | string): FsStatResult | null {
  try {
    return typeof file === "string" ? getFs().statSync(file) : file.stat();
  } catch {
    return null;
  }
}

/**
 * `isdirsep` (`vendor/ruby/file.c:3306,3311`) — `'/'` on every platform, and
 * `FILE_ALT_SEPARATOR` as well where the build defines one (`file.c:3303`).
 */
function isdirsep(c: string): boolean {
  return c === File.SEPARATOR || c === File.ALT_SEPARATOR;
}

/**
 * `chompdirsep` (`vendor/ruby/file.c:3484`), which answers the path without
 * the run of separators that terminates it, and the whole path where none
 * does.
 */
function chompdirsep(path: string): string {
  let end = path.length;
  while (end > 0 && isdirsep(path[end - 1])) end--;
  return path.slice(0, end);
}

/**
 * `to_uid` (`vendor/ruby/file.c:2661`), which maps a `nil` owner onto `-1` —
 * the id `chown(2)` reads as "leave this one unchanged".
 */
function toUid(u: number | null): number {
  if (u == null) return -1;
  return u;
}

/** `to_gid` (`vendor/ruby/file.c:2670`), `to_uid`'s group half. */
function toGid(g: number | null): number {
  if (g == null) return -1;
  return g;
}

/**
 * `File` (`vendor/ruby/file.c:7354` `rb_cFile`), the sliver of it trails calls.
 *
 * Rails reaches the filesystem through this class — `File.exist?(key)` in
 * `vendor/rails/activesupport/lib/active_support/cache/file_store.rb:125`,
 * `File.join(cache_path, ...)` at `file_store.rb:185`,
 * `File.realpath(dir)` at `file_store.rb:196` — so trails reaches it through a
 * class of the same name rather than through members named after node's `fs`.
 * The backend a member lands on is the `FsAdapter` contract in
 * `./fs-adapter.js`; a platform registers one, and nothing here names a
 * runtime.
 *
 * Only the members ported bodies call are here. `File::SEPARATOR` is `"/"` on
 * every platform (`vendor/ruby/file.c:7427`); the backslash is
 * `File::ALT_SEPARATOR`, which is `nil` off DOSISH (`file.c:7435`).
 *
 * @noRailsEquivalent PERMANENT — Ruby core `File` (`vendor/ruby/file.c:7354`),
 * which Rails calls without defining, so no Rails or gem file declares the
 * class this file's single export lives in.
 */
export class File extends IO {
  /**
   * `vendor/ruby/file.c:7427` — `File::SEPARATOR`, `"/"` on every platform.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File::SEPARATOR`.
   */
  static readonly SEPARATOR = "/";

  /**
   * `vendor/ruby/file.c:7433` — `File::ALT_SEPARATOR`, the `'\\'` of
   * `FILE_ALT_SEPARATOR` (`file.c:3303`) where the build is DOSISH, and `nil`
   * everywhere else (`file.c:7435`). The platform answer comes from the
   * registered path backend's separator rather than from a runtime global.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File::ALT_SEPARATOR`.
   */
  static get ALT_SEPARATOR(): string | null {
    return getPath().sep === "\\" ? "\\" : null;
  }

  /**
   * `vendor/ruby/file.c:7841` — `File::LOCK_EX`, the exclusive-lock operation
   * `File#flock` takes (`file.c:5198`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File::LOCK_EX`.
   */
  static readonly LOCK_EX = 2;

  /**
   * `vendor/ruby/file.c:7843` — `File::LOCK_UN`, the release operation
   * `File#flock` takes (`file.c:5204`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File::LOCK_UN`.
   */
  static readonly LOCK_UN = 8;

  /**
   * `vendor/ruby/file.c:1806` `rb_file_exist_p`, which is `rb_stat(fname)`
   * against a FOLLOWED symlink — so a broken symlink is `false` even though
   * `File.symlink?` is `true`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.exist?`
   * (`vendor/ruby/file.c:1806`).
   */
  static isExist(fileName: string): boolean {
    return getFs().existsSync(fileName);
  }

  /**
   * `vendor/ruby/file.c:2196` `rb_file_identical_p` — `false` unless both
   * names stat successfully and report the same `st_dev` and `st_ino`
   * (`file.c:2201-2205`). Either argument may be an open stream, which
   * `rb_stat` (`file.c:1296`) `fstat`s instead. An adapter that reports no
   * device identity cannot answer, so it answers `false`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.identical?`
   * (`vendor/ruby/file.c:2196`).
   */
  static isIdentical(fileName1: IO | string, fileName2: IO | string): boolean {
    const st1 = rbStat(fileName1);
    const st2 = rbStat(fileName2);
    if (!st1 || !st2) return false;
    if (st1.dev == null || st1.ino == null) return false;
    if (st1.dev !== st2.dev) return false;
    if (st1.ino !== st2.ino) return false;
    return true;
  }

  /**
   * `vendor/ruby/file.c:1615` `rb_file_directory_p`, which answers `false`
   * rather than raising when the stat fails (`file.c:1622`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.directory?`
   * (`vendor/ruby/file.c:1615`).
   */
  static isDirectory(fileName: string): boolean {
    try {
      return getFs().statSync(fileName).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * `vendor/ruby/file.c:2009` `rb_file_file_p`, `false` on a failed stat.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.file?`
   * (`vendor/ruby/file.c:2009`).
   */
  static isFile(fileName: string): boolean {
    try {
      return getFs().statSync(fileName).isFile();
    } catch {
      return false;
    }
  }

  /**
   * `vendor/ruby/file.c:1826` `rb_file_readable_p`, which is
   * `rb_eaccess(fname, R_OK) >= 0` and so is `false` both for a file that is
   * not there and for one the effective user cannot read. `R_OK` is POSIX's
   * `4` rather than a Ruby constant. A backend with no access check has no
   * `accessSync`, and there existence is all that can be answered.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.readable?`
   * (`vendor/ruby/file.c:1826`).
   */
  static isReadable(fileName: string): boolean {
    const fs = getFs();
    if (!fs.accessSync) return fs.existsSync(fileName);
    try {
      fs.accessSync(fileName, 4);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * `vendor/ruby/file.c:1329` `rb_file_s_stat`, which RAISES `Errno::ENOENT`
   * rather than answering `nil` when the path is not there — the predicates
   * above are the arms that swallow it.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.stat`
   * (`vendor/ruby/file.c:1329`).
   */
  static stat(fileName: string): FsStatResult {
    return getFs().statSync(fileName);
  }

  /**
   * `vendor/ruby/file.c:2047` `rb_file_size_p` — `File.size?`, `nil` both when
   * the file is missing AND when it is empty, which is what makes it a
   * three-state answer rather than a size.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.size?`
   * (`vendor/ruby/file.c:2047`).
   */
  static sizeQ(fileName: string): number | null {
    let size: number;
    try {
      size = File.stat(fileName).size;
    } catch {
      return null;
    }
    return size === 0 ? null : size;
  }

  /**
   * `vendor/ruby/io.c:15418`, where `rb_cFile` registers `rb_io_s_open`
   * (`io.c:8148`): with a block the stream is closed once the block returns
   * and the block's value is the answer. Ruby's mode string carries the
   * binary flag node's `flags` has no letter for, so `b` is dropped from the
   * flags and recorded on the stream instead (`rb_io_binmode`, `io.c:6311`),
   * where {@link IO#write} reads it.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.open`
   * (`vendor/ruby/io.c:8148`).
   */
  static open(fileName: string, mode: string): File;
  static open<T>(fileName: string, mode: string, block: (file: File) => T): T;
  static open<T>(fileName: string, mode: string, block?: (file: File) => T): T | File {
    const file = new File(getFs().openSync(fileName, mode.replace(/b/g, "")), fileName);
    if (mode.includes("b")) file.binmode();
    if (!block) return file;
    try {
      return block(file);
    } finally {
      file.close();
    }
  }

  /**
   * `vendor/ruby/io.c:12200` `rb_io_s_read`, in its whole-file form.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.read` (`IO.read`,
   * `vendor/ruby/io.c:12200`).
   */
  static read(name: string): string {
    return getFs().readFileSync(name, "utf-8");
  }

  /**
   * `vendor/ruby/io.c:12377` `rb_io_s_write`, which answers the number of
   * BYTES written rather than the string itself.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.write` (`IO.write`,
   * `vendor/ruby/io.c:12377`).
   */
  static write(name: string, string: string): number {
    getFs().writeFileSync(name, string);
    return new TextEncoder().encode(string).length;
  }

  /**
   * `vendor/ruby/file.c:3202` `rb_file_s_unlink`, which answers the number of
   * files deleted and raises on the first failure.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.delete`
   * (`vendor/ruby/file.c:3202`).
   */
  static delete(...files: string[]): number {
    for (const file of files) getFs().unlinkSync(file);
    return files.length;
  }

  /**
   * `vendor/ruby/file.c:2575` `rb_file_s_chmod`, which answers the number of
   * files whose mode was set. A backend with no permission bits has no
   * `chmodSync`, and there the call is a no-op.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.chmod`
   * (`vendor/ruby/file.c:2575`).
   */
  static chmod(mode: number, ...files: string[]): number {
    for (const file of files) getFs().chmodSync?.(file, mode);
    return files.length;
  }

  /**
   * `vendor/ruby/file.c:2706` `rb_file_s_chown`, which answers the number of
   * files whose owner was set. A `nil` owner or group is ignored
   * (`file.c:2698`) — `File.chown(nil, 100, "testfile")` — which `to_uid` /
   * `to_gid` (`file.c:2661,2670`) carry through as `-1`. A backend with no
   * ownership has no `chownSync`, and there the call is a no-op.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.chown`
   * (`vendor/ruby/file.c:2706`).
   */
  static chown(owner: number | null, group: number | null, ...files: string[]): number {
    const uid = toUid(owner);
    const gid = toGid(group);
    for (const file of files) getFs().chownSync?.(file, uid, gid);
    return files.length;
  }

  /**
   * `vendor/ruby/file.c:3231` `rb_file_s_rename`, which answers `0` and
   * replaces `to` when it already exists.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.rename`
   * (`vendor/ruby/file.c:3231`).
   */
  static rename(from: string, to: string): number {
    getFs().renameSync(from, to);
    return 0;
  }

  /**
   * `vendor/ruby/file.c:2427` `rb_file_s_mtime`, the modification Time of a
   * FOLLOWED symlink — it raises `ENOENT` rather than answering `nil` when the
   * path does not exist.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.mtime`
   * (`vendor/ruby/file.c:2427`).
   */
  static mtime(fileName: string): Date {
    return getFs().statSync(fileName).mtime;
  }

  /**
   * `vendor/ruby/file.c:4559` `rb_file_s_realpath`, which resolves every
   * symlink and raises `ENOENT` when the path does not exist. A backend with
   * no symlink support has no `realpathSync`, and there the path resolves
   * lexically.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.realpath`
   * (`vendor/ruby/file.c:4559`).
   */
  static realpath(pathname: string): string {
    const fs = getFs();
    if (fs.realpathSync) return fs.realpathSync(pathname);
    return File.expandPath(pathname);
  }

  /**
   * `vendor/ruby/file.c:5013` `rb_file_join`, which is a STRING join and not
   * a path normalization: `File.join("a", "..", "b")` is `"a/../b"`, where
   * node's `path.join` answers `"b"`. A separator at the boundary is squeezed
   * to one (`file.c:5061-5067`) — `File.join("a//", "/b")` is `"a/b"` — and an
   * empty component keeps its separator, so `File.join("a", "")` is `"a/"`.
   * Both boundary arms test with `isdirsep`, so a `File::ALT_SEPARATOR` at the
   * boundary is a separator too: `File.join("a\\", "b")` is `"a\\b"` on
   * Windows and `"a\\/b"` on POSIX.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.join`
   * (`vendor/ruby/file.c:5013`).
   */
  static join(...args: string[]): string {
    if (args.length === 0) return "";
    let result = args[0];
    for (const tmp of args.slice(1)) {
      const tail = chompdirsep(result);
      if (isdirsep(tmp.charAt(0))) result = `${tail}${tmp}`;
      else if (tail.length === result.length) result = `${result}${File.SEPARATOR}${tmp}`;
      else result = `${result}${tmp}`;
    }
    return result;
  }

  /**
   * `vendor/ruby/file.c:4770` `rb_file_s_dirname`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.dirname`
   * (`vendor/ruby/file.c:4770`).
   */
  static dirname(fileName: string): string {
    return getPath().dirname(fileName);
  }

  /**
   * `vendor/ruby/file.c:4705` `rb_file_s_basename`. The optional `suffix` is
   * stripped, and the literal `".*"` strips whatever extension is there
   * (`file.c:4664-4680`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.basename`
   * (`vendor/ruby/file.c:4705`).
   */
  static basename(fileName: string, suffix?: string): string {
    const base = getPath().basename(fileName);
    if (suffix === undefined) return base;
    if (suffix === ".*") {
      const extname = File.extname(base);
      return extname === "" ? base : base.slice(0, base.length - extname.length);
    }
    return base.endsWith(suffix) && base !== suffix
      ? base.slice(0, base.length - suffix.length)
      : base;
  }

  /**
   * `vendor/ruby/file.c:4954` `rb_file_s_extname`: a leading dot is not an
   * extension (`".bashrc"` is `""`) and a trailing dot is (`"b."` is `"."`).
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.extname`
   * (`vendor/ruby/file.c:4954`).
   */
  static extname(fileName: string): string {
    return getPath().extname(fileName);
  }

  /**
   * `vendor/ruby/file.c:4126` `rb_file_s_expand_path`, which resolves
   * `fileName` against `dirString` — the working directory when it is omitted.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.expand_path`
   * (`vendor/ruby/file.c:4126`).
   */
  static expandPath(fileName: string, dirString?: string): string {
    return getPath().resolve(dirString ?? getFs().cwd(), fileName);
  }

  /**
   * `vendor/ruby/file.c:4210` `rb_file_s_absolute_path_p`.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File.absolute_path?`
   * (`vendor/ruby/file.c:4210`).
   */
  static isAbsolutePath(fileName: string): boolean {
    return getPath().isAbsolute?.(fileName) ?? fileName.startsWith(File.SEPARATOR);
  }

  /**
   * `vendor/ruby/file.c:5301` `rb_file_flock`, which answers `0` once the lock
   * is held. A backend with no advisory locking — node's `fs` exposes no
   * `flock(2)` — has no `flockSync`, and there the stream is left unlocked,
   * which is what an unlockable file already behaves like.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `File#flock`
   * (`vendor/ruby/file.c:5301`).
   */
  flock(operation: number): number {
    getFs().flockSync?.(this.fd, operation === File.LOCK_UN ? "un" : "ex");
    return 0;
  }
}
